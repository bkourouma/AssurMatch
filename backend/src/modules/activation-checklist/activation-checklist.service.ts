import type {
  ActivationChecklistControl,
  ActivationChecklistQuery,
  ActivationChecklistResponse,
  ActivationChecklistSection,
  ActivationChecklistStatus
} from "../../../../packages/shared/contracts/activation-checklist.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { ConsentService } from "../consent/consent.module";
import type { CountriesService, Country } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { OfferRecord, OffersModule } from "../offers/offers.module";
import type { PartnerLicense, PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnerTenant, PartnersService } from "../partners/partners.module";
import { effectiveProductFlags, countryLinkFor, type Product, type ProductsService } from "../products/products.module";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import { OfferPublicationPolicy } from "../offers/offer-publication-policy";
import { countryCatalog, productCatalog, resolveScopeCodes } from "../common/scope/actor-scope-codes";
import { ActivationChecklistAuditActions } from "./activation-checklist-audit-actions";

type ActivationChecklistRole = "super_admin" | "admin_pays" | "compliance_admin";

const ALLOWED_ROLES = new Set<ActivationChecklistRole>(["super_admin", "admin_pays", "compliance_admin"]);
const FORBIDDEN_FLAG_KEYS = [
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "ai_lead_scoring_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled",
  "multi_broker_routing_enabled",
  "whatsapp_enabled",
  "billing_enabled"
] as const;

export interface ActivationChecklistDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  countries: CountriesService;
  products: ProductsService;
  partners: PartnersService;
  partnerLicenses: PartnerLicensesService;
  offers: OffersModule;
  quoteForms: QuoteFormDefinitionService;
  consent: ConsentService;
  /**
   * Spec 051 R14: per partner readiness (accepted and clean accreditation document, owner user,
   * recorded contract). Optional so hand-built checklists in unit tests keep their scope; the
   * runtime always provides it.
   */
  partnerReadiness?: { readiness(partnerId: string): Promise<{ documentAccepted: boolean; ownerUser: boolean; contract: boolean }> } | undefined;
}

export class ActivationChecklistAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Activation checklist access denied: ${reason}`);
    this.name = "ActivationChecklistAccessRefusedError";
  }
}

/** Spec 050 R4: one failing blocking control, as returned to the admin when an activation is refused. */
export interface ActivationBlocker {
  section: string;
  control: string;
  label: string;
  evidence: string;
}

export class ActivationChecklistService {
  constructor(private readonly deps: ActivationChecklistDeps) {}

  /**
   * Spec 050 R4: blocking controls for opening one country to the public. It reuses the checklist
   * rules (country, linked products, quote readiness, licensed partner, offers) without the role
   * resolution and the read audit of `read()`: the catalogue layer has already authorised the caller
   * and audits the activation attempt itself. Per partner sections are left out: the country
   * control `country_active_licensed_partner` carries the "at least one" condition instead.
   */
  async countryActivationBlockers(countryId: string, ignoredControls: string[] = []): Promise<ActivationBlocker[]> {
    const country = await this.deps.countries.require(countryId);
    const countries = [country];
    const products = (await this.deps.products.listAdmin(country.id)).filter((product) => product.countryIds.includes(country.id));
    const [offers, consentTexts, forms, partners] = await Promise.all([
      this.deps.offers.repository.list(),
      this.deps.consent.listTexts(),
      this.deps.quoteForms.list(),
      this.deps.partners.list()
    ]);
    const sections: ActivationChecklistSection[] = [
      await this.countrySection(country),
      ...products.map((product) => this.productSection(product, countries)),
      ...this.quoteReadinessSections(countries, products, forms, consentTexts),
      ...await this.offerSections(offers, countries, products, partners)
    ];
    const ignored = new Set(ignoredControls);
    return sections.flatMap((section) => section.controls
      .filter((control) => control.blocking && control.status === "blocked" && !ignored.has(control.key))
      .map((control) => ({ section: section.key, control: control.key, label: control.label, evidence: control.evidence })));
  }

  async read(actor: ActorContext, query: ActivationChecklistQuery): Promise<ActivationChecklistResponse> {
    const role = this.resolveRole(actor);
    const countries = await this.resolveCountries(actor, role, query);
    const products = await this.resolveProducts(actor, role, query, countries);
    const partners = await this.resolvePartners(query);
    const [offers, consentTexts] = await Promise.all([
      this.deps.offers.repository.list(),
      this.deps.consent.listTexts()
    ]);
    const forms = await this.deps.quoteForms.list();
    const sections: ActivationChecklistSection[] = [
      this.globalSection(),
      ...await Promise.all(countries.map((country) => this.countrySection(country))),
      ...products.map((product) => this.productSection(product, countries)),
      ...this.quoteReadinessSections(countries, products, forms, consentTexts),
      ...await this.partnerSections(partners, countries, products),
      ...await this.offerSections(offers, countries, products, partners)
    ];
    const response: ActivationChecklistResponse = {
      generatedAt: new Date().toISOString(),
      summary: this.summarize(sections),
      sections
    };
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.read,
      targetType: "ActivationChecklist",
      targetId: "admin",
      scope: { query, role },
      result: "success",
      context: { sections: sections.length, summary: response.summary }
    });
    return response;
  }

  private resolveRole(actor: ActorContext): ActivationChecklistRole {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    const role = (actor.roles as ActivationChecklistRole[]).find((candidate) => ALLOWED_ROLES.has(candidate));
    if (!role) this.refuse(actor, "forbidden_role");
    return role;
  }

  private async resolveCountries(actor: ActorContext, role: ActivationChecklistRole, query: ActivationChecklistQuery): Promise<Country[]> {
    const all = await this.deps.countries.listAdmin();
    if (role === "admin_pays" && !actor.countryScopes?.length) {
      this.refuse(actor, "missing_country_scope");
    }
    // Scopes are stored as country ids; this checklist compares them to ISO codes.
    const countryScopes = resolveScopeCodes(actor.countryScopes, countryCatalog(all));
    if (query.country) {
      if (role === "admin_pays" && countryScopes.length && !countryScopes.includes(query.country)) {
        this.refuse(actor, "out_of_scope_country");
      }
      return all.filter((country) => country.isoCode === query.country);
    }
    if (role === "admin_pays" && countryScopes.length) {
      return all.filter((country) => countryScopes.includes(country.isoCode));
    }
    return all;
  }

  private async resolveProducts(actor: ActorContext, role: ActivationChecklistRole, query: ActivationChecklistQuery, countries: Country[]): Promise<Product[]> {
    const countryIds = new Set(countries.map((country) => country.id));
    const scopedProducts = (await Promise.all(countries.map((country) => this.deps.products.listAdmin(country.id)))).flat();
    const unique = [...new Map(scopedProducts.map((product) => [product.id, product])).values()];
    // Scopes are stored as product ids; this checklist compares them to product keys.
    const productScopes = resolveScopeCodes(actor.productScopes, productCatalog(await this.deps.products.listAdmin()));
    if (query.product) {
      if (role !== "super_admin" && productScopes.length && !productScopes.includes(query.product)) {
        this.refuse(actor, "out_of_scope_product");
      }
      return unique.filter((product) => product.key === query.product && product.countryIds.some((countryId) => countryIds.has(countryId)));
    }
    if (role !== "super_admin" && productScopes.length) {
      return unique.filter((product) => productScopes.includes(product.key));
    }
    return unique;
  }

  private async resolvePartners(query: ActivationChecklistQuery): Promise<PartnerTenant[]> {
    const partners = await this.deps.partners.list();
    return query.partnerId ? partners.filter((partner) => partner.id === query.partnerId) : partners;
  }

  private globalSection(): ActivationChecklistSection {
    return this.section("global", "Flags globaux publics", {}, [
      this.control("public_comparator_enabled", "Comparateur public global", this.deps.featureFlags.isEnabled("public_comparator_enabled"), true),
      this.control("quote_request_enabled", "Demande de devis globale", this.deps.featureFlags.isEnabled("quote_request_enabled"), true),
      this.control("sponsored_offers_enabled", "Offres sponsorisees", !this.deps.featureFlags.isEnabled("sponsored_offers_enabled"), false, "Desactive attendu sauf activation explicite"),
      ...FORBIDDEN_FLAG_KEYS.map((key) =>
        this.control(key, `${key} ferme`, !this.deps.featureFlags.isEnabled(key), true, this.deps.featureFlags.isEnabled(key) ? "actif interdit" : "desactive")
      )
    ]);
  }

  private async countrySection(country: Country): Promise<ActivationChecklistSection> {
    const licensedPartners = await this.activeLicensedPartnerCount(country.id);
    return this.section(`country:${country.id}`, `Pays ${country.isoCode}`, { countryId: country.id, countryCode: country.isoCode }, [
      this.control("country_status_public", "Statut pays public", country.status === "public", true, country.status),
      this.control("country_regime", "Regime reglementaire renseigne", Boolean(country.regulatoryRegimeId), true),
      this.control("country_public_enabled", "Flag pays public", country.flags.country_public_enabled === true, true),
      this.control("country_comparison_enabled", "Flag comparaison pays", country.flags.country_comparison_enabled === true, true),
      this.control("country_quote_enabled", "Flag devis pays", country.flags.country_quote_enabled === true, true),
      // Spec 050 T009 / spec 051 R14: opening a country needs at least one Actif public partner,
      // authorised, holding a valid licence there and an accepted accreditation document.
      this.control(
        "country_active_licensed_partner",
        "Au moins un courtier actif public, autorise, licencie et avec agrement accepte",
        licensedPartners > 0,
        true,
        licensedPartners > 0 ? `${licensedPartners} courtier(s)` : "aucun courtier actif licencie"
      )
    ]);
  }

  /**
   * Actif public partners (`active` only: `active_test` never counts) authorised for the country,
   * holding a valid, unexpired licence there and an accepted, clean accreditation document.
   */
  private async activeLicensedPartnerCount(countryId: string): Promise<number> {
    const partners = (await this.deps.partners.list()).filter((partner) => partner.status === "active");
    const today = Date.now();
    let count = 0;
    for (const partner of partners) {
      const [authorized, licenses] = await Promise.all([
        this.deps.partners.isAuthorizedForCountry(partner.id, countryId),
        this.deps.partnerLicenses.listForPartner(partner.id)
      ]);
      const licensed = licenses.some((license: PartnerLicense) =>
        license.status === "valid" && license.countryId === countryId && new Date(license.expirationDate).getTime() > today
      );
      const documented = !this.deps.partnerReadiness || (authorized && licensed && (await this.deps.partnerReadiness.readiness(partner.id)).documentAccepted);
      if (authorized && licensed && documented) count += 1;
    }
    return count;
  }

  private productSection(product: Product, countries: Country[]): ActivationChecklistSection {
    // Spec 050 R2: flags are read per country (product flag AND link flag) for the scoped countries.
    const links = countries.map((country) => countryLinkFor(product, country.id)).filter((link) => link !== undefined && link.status !== "retired");
    const effective = links.map((link) => effectiveProductFlags(product, link));
    const anyEffective = (key: "product_public_enabled" | "product_comparison_enabled" | "product_quote_enabled"): boolean => effective.some((flags) => flags[key] === true);
    return this.section(`product:${product.id}`, `Produit ${product.key}`, { productId: product.id, productKey: product.key }, [
      this.control("product_status_public", "Statut produit public", product.status === "public", true, product.status),
      this.control("product_country_association", "Produit associe au pays scope", links.length > 0, true),
      this.control("product_public_enabled", "Flag produit public", anyEffective("product_public_enabled"), true),
      this.control("product_comparison_enabled", "Flag comparaison produit", anyEffective("product_comparison_enabled"), true),
      this.control("product_quote_enabled", "Flag devis produit", anyEffective("product_quote_enabled"), true),
      this.control("product_manual_review_required", "Revue manuelle explicite", product.flags.product_manual_review_required === true || product.requiresManualReview === true, false)
    ]);
  }

  private quoteReadinessSections(countries: Country[], products: Product[], forms: Awaited<ReturnType<QuoteFormDefinitionService["list"]>>, consentTexts: Awaited<ReturnType<ConsentService["listTexts"]>>): ActivationChecklistSection[] {
    const sections: ActivationChecklistSection[] = [];
    for (const country of countries) {
      for (const product of products.filter((candidate) => candidate.countryIds.includes(country.id))) {
        // Spec 050 R6: one published form per language; each must reference a published
        // lead_transmission text of its own language, country and product (or no product).
        const publishedForms = forms.filter((form) => form.countryId === country.id && form.productId === product.id && form.status === "published");
        const publishedForm = publishedForms[0];
        const consentFor = (form: (typeof publishedForms)[number]) => consentTexts.find((text) =>
          text.id === form.consentTextId &&
          text.status === "published" &&
          text.purpose === "lead_transmission" &&
          text.language === form.language &&
          text.countryId === form.countryId &&
          (!text.productId || text.productId === form.productId)
        );
        const mismatched = publishedForms.filter((form) => !consentFor(form)).map((form) => form.language);
        const publishedConsent = publishedForms.length > 0 && mismatched.length === 0;
        sections.push(this.section(`quote:${country.id}:${product.id}`, `Parcours devis ${country.isoCode}/${product.key}`, {
          countryId: country.id,
          countryCode: country.isoCode,
          productId: product.id,
          productKey: product.key
        }, [
          this.control("published_quote_form", "Formulaire publie", Boolean(publishedForm), true),
          this.control(
            "published_consent_text",
            "Consentement publie",
            publishedConsent,
            true,
            mismatched.length ? `non conforme pour : ${mismatched.join(", ")}` : undefined
          )
        ]));
      }
    }
    return sections;
  }

  private async partnerSections(partners: PartnerTenant[], countries: Country[], products: Product[]): Promise<ActivationChecklistSection[]> {
    const sections: ActivationChecklistSection[] = [];
    for (const partner of partners) {
      for (const country of countries) {
        for (const product of products.filter((candidate) => candidate.countryIds.includes(country.id))) {
          const eligibility = await this.partnerEligibility(partner.id, country.id, product.id);
          const readiness = this.deps.partnerReadiness ? await this.deps.partnerReadiness.readiness(partner.id) : undefined;
          sections.push(this.section(`partner:${partner.id}:${country.id}:${product.id}`, `${partner.legalName} - ${country.isoCode}/${product.key}`, {
            partnerId: partner.id,
            countryId: country.id,
            countryCode: country.isoCode,
            productId: product.id,
            productKey: product.key
          }, [
            this.control("partner_active", "Partenaire actif", partner.status === "active", true, partner.status),
            this.control("partner_capacity", "Capacite disponible", partner.capacityStatus !== "blocked" && partner.capacityStatus !== "full", true, partner.capacityStatus),
            this.control("partner_country_authorized", "Autorisation pays", eligibility.countryAuthorized, true),
            this.control("partner_product_authorized", "Autorisation produit", eligibility.productAuthorized, true),
            this.control("partner_license_valid", "Licence valide sur scope", eligibility.licenseValid, true),
            // Spec 051 R14: accreditation proof, owner user and contract (FR-027).
            ...(readiness ? [
              this.control("partner_document_accepted", "Preuve d'agrement acceptee et saine", readiness.documentAccepted, true),
              this.control("partner_owner_user", "Utilisateur proprietaire invite ou actif", readiness.ownerUser, true),
              this.control("partner_contract", "Contrat de partenariat enregistre", readiness.contract, true)
            ] : [])
          ]));
        }
      }
    }
    return sections;
  }

  private async offerSections(offers: OfferRecord[], countries: Country[], products: Product[], partners: PartnerTenant[]): Promise<ActivationChecklistSection[]> {
    const countryIds = new Set(countries.map((country) => country.id));
    const productIds = new Set(products.map((product) => product.id));
    const partnerIds = partners.length ? new Set(partners.map((partner) => partner.id)) : null;
    const policy = new OfferPublicationPolicy();
    const scopedOffers = offers.filter((offer) =>
      countryIds.has(offer.countryId)
      && productIds.has(offer.productId)
      && (!partnerIds || (offer.partnerTenantId ? partnerIds.has(offer.partnerTenantId) : true))
    );
    const publicationResults = await Promise.all(scopedOffers.map(async (offer) => {
      const publication = policy.evaluate(offer);
      const sponsoredAllowed = !offer.isSponsored || this.deps.featureFlags.isEnabled("sponsored_offers_enabled");
      // Platform-owned offers carry no partner, and the public catalog skips partner eligibility for them.
      const partnerEligible = offer.partnerTenantId ? await this.partnerEligibility(offer.partnerTenantId, offer.countryId, offer.productId) : { eligible: true };
      return {
        offer,
        public: publication.public && sponsoredAllowed && partnerEligible.eligible,
        reasons: [
          ...publication.reasons,
          ...(sponsoredAllowed ? [] : ["sponsored_offers_disabled"]),
          ...(partnerEligible.eligible ? [] : ["partner_not_eligible"])
        ]
      };
    }));
    return [this.section("offers", "Offres publiques candidates", {}, [
      this.control("publishable_offer", "Au moins une offre publiable et eligible", publicationResults.some((result) => result.public), true),
      this.control(
        "no_blocked_active_offer",
        "Aucune offre active bloquee par la politique",
        !publicationResults.some((result) => result.offer.status === "active" && !result.public),
        true,
        publicationResults.flatMap((result) => result.reasons).join(", ") || "pret"
      )
    ])];
  }

  private async partnerEligibility(partnerId: string, countryId: string, productId: string): Promise<{
    countryAuthorized: boolean;
    productAuthorized: boolean;
    licenseValid: boolean;
    eligible: boolean;
  }> {
    const [countryAuthorized, productAuthorized, licenses] = await Promise.all([
      this.deps.partners.isAuthorizedForCountry(partnerId, countryId),
      this.deps.partners.isAuthorizedForProduct(partnerId, productId),
      this.deps.partnerLicenses.listForPartner(partnerId)
    ]);
    const today = Date.now();
    const licenseValid = licenses.some((license: PartnerLicense) =>
      license.status === "valid"
      && license.countryId === countryId
      && new Date(license.expirationDate).getTime() > today
      && (license.productIds.length === 0 || license.productIds.includes(productId))
    );
    return {
      countryAuthorized,
      productAuthorized,
      licenseValid,
      eligible: countryAuthorized && productAuthorized && licenseValid
    };
  }

  private section(
    key: string,
    title: string,
    scope: Partial<ActivationChecklistSection["scope"]>,
    controls: ActivationChecklistControl[]
  ): ActivationChecklistSection {
    return {
      key,
      title,
      status: this.sectionStatus(controls),
      scope: {
        countryId: scope.countryId ?? null,
        countryCode: scope.countryCode ?? null,
        productId: scope.productId ?? null,
        productKey: scope.productKey ?? null,
        partnerId: scope.partnerId ?? null
      },
      controls
    };
  }

  private control(key: string, label: string, passed: boolean, blocking: boolean, evidence?: string): ActivationChecklistControl {
    return {
      key,
      label,
      status: passed ? "passed" : blocking ? "blocked" : "warning",
      evidence: evidence ?? (passed ? "pret" : "manquant"),
      blocking
    };
  }

  private sectionStatus(controls: ActivationChecklistControl[]): ActivationChecklistStatus {
    if (controls.some((control) => control.status === "blocked" && control.blocking)) return "blocked";
    if (controls.some((control) => control.status === "warning")) return "warning";
    return "passed";
  }

  private summarize(sections: ActivationChecklistSection[]): ActivationChecklistResponse["summary"] {
    return {
      passed: sections.filter((section) => section.status === "passed").length,
      warning: sections.filter((section) => section.status === "warning").length,
      blocked: sections.filter((section) => section.status === "blocked").length
    };
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.refused,
      targetType: "ActivationChecklist",
      targetId: "admin",
      scope: { roles: actor.roles, mfaVerified: actor.mfaVerified ?? false },
      result: "refused",
      reason,
      context: {}
    });
    throw new ActivationChecklistAccessRefusedError(reason);
  }
}
