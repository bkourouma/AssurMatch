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
import type { Product, ProductsService } from "../products/products.module";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import { OfferPublicationPolicy } from "../offers/offer-publication-policy";
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
}

export class ActivationChecklistAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Activation checklist access denied: ${reason}`);
    this.name = "ActivationChecklistAccessRefusedError";
  }
}

export class ActivationChecklistService {
  constructor(private readonly deps: ActivationChecklistDeps) {}

  async read(actor: ActorContext, query: ActivationChecklistQuery): Promise<ActivationChecklistResponse> {
    const role = this.resolveRole(actor);
    const countries = await this.resolveCountries(actor, role, query);
    const products = await this.resolveProducts(actor, role, query, countries);
    const partners = await this.resolvePartners(query);
    const [offers, consentTexts] = await Promise.all([
      this.deps.offers.repository.list(),
      this.deps.consent.listTexts()
    ]);
    const forms = this.deps.quoteForms.list();
    const sections: ActivationChecklistSection[] = [
      this.globalSection(),
      ...countries.map((country) => this.countrySection(country)),
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
    if (query.country) {
      if (role === "admin_pays" && actor.countryScopes?.length && !actor.countryScopes.includes(query.country)) {
        this.refuse(actor, "out_of_scope_country");
      }
      return all.filter((country) => country.isoCode === query.country);
    }
    if (role === "admin_pays" && actor.countryScopes?.length) {
      return all.filter((country) => actor.countryScopes?.includes(country.isoCode));
    }
    return all;
  }

  private async resolveProducts(actor: ActorContext, role: ActivationChecklistRole, query: ActivationChecklistQuery, countries: Country[]): Promise<Product[]> {
    const countryIds = new Set(countries.map((country) => country.id));
    const scopedProducts = (await Promise.all(countries.map((country) => this.deps.products.listAdmin(country.id)))).flat();
    const unique = [...new Map(scopedProducts.map((product) => [product.id, product])).values()];
    if (query.product) {
      if (role !== "super_admin" && actor.productScopes?.length && !actor.productScopes.includes(query.product)) {
        this.refuse(actor, "out_of_scope_product");
      }
      return unique.filter((product) => product.key === query.product && product.countryIds.some((countryId) => countryIds.has(countryId)));
    }
    if (role !== "super_admin" && actor.productScopes?.length) {
      return unique.filter((product) => actor.productScopes?.includes(product.key));
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

  private countrySection(country: Country): ActivationChecklistSection {
    return this.section(`country:${country.id}`, `Pays ${country.isoCode}`, { countryId: country.id, countryCode: country.isoCode }, [
      this.control("country_status_public", "Statut pays public", country.status === "public", true, country.status),
      this.control("country_regime", "Regime reglementaire renseigne", Boolean(country.regulatoryRegimeId), true),
      this.control("country_public_enabled", "Flag pays public", country.flags.country_public_enabled === true, true),
      this.control("country_comparison_enabled", "Flag comparaison pays", country.flags.country_comparison_enabled === true, true),
      this.control("country_quote_enabled", "Flag devis pays", country.flags.country_quote_enabled === true, true)
    ]);
  }

  private productSection(product: Product, countries: Country[]): ActivationChecklistSection {
    const countryIds = new Set(countries.map((country) => country.id));
    return this.section(`product:${product.id}`, `Produit ${product.key}`, { productId: product.id, productKey: product.key }, [
      this.control("product_status_public", "Statut produit public", product.status === "public", true, product.status),
      this.control("product_country_association", "Produit associe au pays scope", product.countryIds.some((countryId) => countryIds.has(countryId)), true),
      this.control("product_public_enabled", "Flag produit public", product.flags.product_public_enabled === true, true),
      this.control("product_comparison_enabled", "Flag comparaison produit", product.flags.product_comparison_enabled === true, true),
      this.control("product_quote_enabled", "Flag devis produit", product.flags.product_quote_enabled === true, true),
      this.control("product_manual_review_required", "Revue manuelle explicite", product.flags.product_manual_review_required === true || product.requiresManualReview === true, false)
    ]);
  }

  private quoteReadinessSections(countries: Country[], products: Product[], forms: ReturnType<QuoteFormDefinitionService["list"]>, consentTexts: Awaited<ReturnType<ConsentService["listTexts"]>>): ActivationChecklistSection[] {
    const sections: ActivationChecklistSection[] = [];
    for (const country of countries) {
      for (const product of products.filter((candidate) => candidate.countryIds.includes(country.id))) {
        const publishedForm = forms.find((form) => form.countryId === country.id && form.productId === product.id && form.status === "published");
        const publishedConsent = publishedForm
          ? consentTexts.find((text) => text.id === publishedForm.consentTextId && text.status === "published" && text.purpose === "lead_transmission")
          : undefined;
        sections.push(this.section(`quote:${country.id}:${product.id}`, `Parcours devis ${country.isoCode}/${product.key}`, {
          countryId: country.id,
          countryCode: country.isoCode,
          productId: product.id,
          productKey: product.key
        }, [
          this.control("published_quote_form", "Formulaire publie", Boolean(publishedForm), true),
          this.control("published_consent_text", "Consentement publie", Boolean(publishedConsent), true)
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
            this.control("partner_license_valid", "Licence valide sur scope", eligibility.licenseValid, true)
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
      const partnerEligible = offer.partnerTenantId ? await this.partnerEligibility(offer.partnerTenantId, offer.countryId, offer.productId) : { eligible: false };
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
