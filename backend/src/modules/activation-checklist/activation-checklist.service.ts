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
import { ActivationChecklistAuditActions } from "./activation-checklist-audit-actions";

type ActivationChecklistRole = "super_admin" | "admin_pays" | "compliance_admin" | "support_admin";

const ALLOWED_ROLES = new Set<ActivationChecklistRole>(["super_admin", "admin_pays", "compliance_admin", "support_admin"]);

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
      ...this.offerSections(offers, countries, products, partners)
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
      this.control("sponsored_offers_enabled", "Offres sponsorisees", !this.deps.featureFlags.isEnabled("sponsored_offers_enabled"), false, "Desactive attendu sauf activation explicite")
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
      const licenses = await this.deps.partnerLicenses.listForPartner(partner.id);
      sections.push(this.section(`partner:${partner.id}`, partner.legalName, { partnerId: partner.id }, [
        this.control("partner_active", "Partenaire actif", partner.status === "active", true, partner.status),
        this.control("partner_capacity", "Capacite disponible", partner.capacityStatus !== "blocked" && partner.capacityStatus !== "full", true, partner.capacityStatus),
        this.control("partner_country_authorized", "Autorisation pays", await this.anyCountryAuthorized(partner.id, countries), true),
        this.control("partner_product_authorized", "Autorisation produit", await this.anyProductAuthorized(partner.id, products), true),
        this.control("partner_license_valid", "Licence valide sur scope", this.hasValidLicense(licenses, countries, products), true)
      ]));
    }
    return sections;
  }

  private offerSections(offers: OfferRecord[], countries: Country[], products: Product[], partners: PartnerTenant[]): ActivationChecklistSection[] {
    const countryIds = new Set(countries.map((country) => country.id));
    const productIds = new Set(products.map((product) => product.id));
    const partnerIds = partners.length ? new Set(partners.map((partner) => partner.id)) : null;
    const scopedOffers = offers.filter((offer) =>
      countryIds.has(offer.countryId)
      && productIds.has(offer.productId)
      && (!partnerIds || (offer.partnerTenantId ? partnerIds.has(offer.partnerTenantId) : true))
    );
    return [this.section("offers", "Offres publiques candidates", {}, [
      this.control("active_validated_offer", "Au moins une offre active validee", scopedOffers.some((offer) => offer.status === "active" && offer.validationStatus === "validated"), true),
      this.control("no_unvalidated_public_offer", "Aucune offre active non validee", !scopedOffers.some((offer) => offer.status === "active" && offer.validationStatus !== "validated"), true)
    ])];
  }

  private async anyCountryAuthorized(partnerId: string, countries: Country[]): Promise<boolean> {
    for (const country of countries) {
      if (await this.deps.partners.isAuthorizedForCountry(partnerId, country.id)) return true;
    }
    return false;
  }

  private async anyProductAuthorized(partnerId: string, products: Product[]): Promise<boolean> {
    for (const product of products) {
      if (await this.deps.partners.isAuthorizedForProduct(partnerId, product.id)) return true;
    }
    return false;
  }

  private hasValidLicense(licenses: PartnerLicense[], countries: Country[], products: Product[]): boolean {
    const countryIds = new Set(countries.map((country) => country.id));
    const productIds = new Set(products.map((product) => product.id));
    const today = Date.now();
    return licenses.some((license) =>
      license.status === "valid"
      && countryIds.has(license.countryId)
      && new Date(license.expirationDate).getTime() > today
      && (license.productIds.length === 0 || license.productIds.some((productId) => productIds.has(productId)))
    );
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
