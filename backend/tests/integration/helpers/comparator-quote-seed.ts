import { QuoteAISummaryService } from "../../../src/modules/ai/quote-summary/quote-ai-summary.service";
import { AuditLogsModule } from "../../../src/modules/audit-logs/audit-logs.module";
import { RedisModule } from "../../../src/modules/common/redis/redis.module";
import { ConsentModule } from "../../../src/modules/consent/consent.module";
import { CountriesModule } from "../../../src/modules/countries/countries.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";
import { NotificationsModule } from "../../../src/modules/notifications/notifications.module";
import { OffersModule } from "../../../src/modules/offers/offers.module";
import { PartnerLicensesModule } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersModule } from "../../../src/modules/partners/partners.module";
import { ProductsModule } from "../../../src/modules/products/products.module";
import { ProspectsModule } from "../../../src/modules/prospects/prospects.module";
import { QuoteFormsModule } from "../../../src/modules/quote-forms/quote-forms.module";
import { QuoteRequestsModule } from "../../../src/modules/quote-requests/quote-requests.module";
import { superAdminActor } from "./enterprise-seed";

export interface ComparatorApp {
  audit: AuditLogsModule;
  redis: RedisModule;
  countries: CountriesModule;
  products: ProductsModule;
  consent: ConsentModule;
  partners: PartnersModule;
  partnerLicenses: PartnerLicensesModule;
  offers: OffersModule;
  quoteForms: QuoteFormsModule;
  prospects: ProspectsModule;
  leads: LeadsModule;
  notifications: NotificationsModule;
  quoteAiSummary: QuoteAISummaryService;
  quoteRequests: QuoteRequestsModule;
}

export interface ComparatorSeed {
  app: ComparatorApp;
  countryId: string;
  productId: string;
  partnerTenantId: string;
  consentTextId: string;
  formDefinitionId: string;
  activeOfferId: string;
  expiredOfferId: string;
}

export function createComparatorApp(): ComparatorApp {
  const audit = new AuditLogsModule();
  const redis = new RedisModule();
  const countries = new CountriesModule(audit.writer);
  const products = new ProductsModule(audit.writer);
  const consent = new ConsentModule(audit.writer);
  const partners = new PartnersModule(audit.writer);
  const partnerLicenses = new PartnerLicensesModule(audit.writer);
  const offers = new OffersModule(audit.writer, redis.client);
  const quoteForms = new QuoteFormsModule(audit.writer, () => consent.service.listTexts().map((text) => ({
    id: text.id,
    version: text.version,
    contentHash: text.contentHash,
    purpose: "lead_transmission",
    recipientCategory: text.recipientCategory,
    status: text.status ?? "draft"
  })));
  const prospects = new ProspectsModule(audit.writer);
  const leads = new LeadsModule(partners.service, partnerLicenses.service, audit.writer);
  const notifications = new NotificationsModule(audit.writer);
  const quoteAiSummary = new QuoteAISummaryService(notifications.queue, audit.writer, {
    id: "00000000-0000-4000-8000-000000000002",
    key: "quote_summary",
    status: "disabled",
    guardrailStatus: "not_configured",
    auditPolicy: "metadata_only",
    modelCallCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  }, {
    globalFlags: { ai_summary_enabled: false },
    countryFlags: { country_ai_enabled: false },
    productFlags: { product_ai_form_assistant_enabled: false }
  });
  const quoteRequests = new QuoteRequestsModule({
    countries: countries.service,
    products: products.service,
    forms: quoteForms.service,
    consent: consent.service,
    identity: prospects.identity,
    prospects: prospects.service,
    routing: leads.routing,
    notifications: notifications.quoteService,
    aiSummary: quoteAiSummary
  }, audit.writer, redis.client);

  return {
    audit,
    redis,
    countries,
    products,
    consent,
    partners,
    partnerLicenses,
    offers,
    quoteForms,
    prospects,
    leads,
    notifications,
    quoteAiSummary,
    quoteRequests
  };
}

export function seedComparatorQuote(): ComparatorSeed {
  const app = createComparatorApp();
  const country = app.countries.service.create({
    isoCode: "CI",
    name: "Cote d'Ivoire",
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Abidjan",
    regulatoryFamily: "cima",
    regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
  }, superAdminActor);
  app.countries.service.update(country.id, {
    status: "public",
    flags: {
      country_public_enabled: true,
      country_comparison_enabled: true,
      country_quote_enabled: true
    },
    reason: "activate comparator pilot"
  }, superAdminActor);

  const product = app.products.service.create({ key: "auto", name: "Assurance auto" }, superAdminActor);
  app.products.service.associateCountry(product.id, country.id, superAdminActor);
  app.products.service.update(product.id, {
    status: "public",
    flags: {
      product_public_enabled: true,
      product_comparison_enabled: true,
      product_quote_enabled: true,
      product_manual_review_required: false
    },
    reason: "activate quote product"
  }, superAdminActor);

  const consentText = app.consent.service.createText({
    purpose: "lead_transmission",
    countryId: country.id,
    productId: product.id,
    channel: "public_web",
    recipientCategory: "courtier_partenaire_eligible",
    language: "fr",
    version: "v1",
    status: "draft",
    contentHash: "hash-lead-transmission-v1"
  }, superAdminActor);
  app.consent.service.publishText(consentText.id, superAdminActor);

  const form = app.quoteForms.service.create({
    countryId: country.id,
    productId: product.id,
    language: "fr",
    version: "v1",
    status: "published",
    fields: [
      { key: "vehicle_use", label: "Usage du vehicule", type: "select", required: true, sensitivity: "public", options: ["prive", "professionnel"] }
    ],
    consentTextId: consentText.id,
    reason: "publish pilot quote form"
  }, superAdminActor);

  const partner = app.partners.service.create({
    legalName: "Broker CI",
    primaryEmail: "ops@broker.example",
    primaryWhatsApp: "+2250102030405",
    status: "active",
    quotaMonthlyLeads: 10
  }, superAdminActor);
  app.partners.service.authorizeCountry(partner.id, country.id, superAdminActor);
  app.partners.service.authorizeProduct(partner.id, product.id, superAdminActor);
  app.partnerLicenses.service.create({
    partnerTenantId: partner.id,
    licenseNumber: "LIC-CI-AUTO",
    issuingAuthority: "Regulator",
    countryId: country.id,
    productIds: [product.id],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, superAdminActor);

  const activeOffer = app.offers.adminService.create({
    countryId: country.id,
    productId: product.id,
    partnerTenantId: partner.id,
    name: "Auto Essentiel",
    guaranteeSummary: "Responsabilite civile indicative",
    indicativePriceMin: 10000,
    indicativePriceMax: 20000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    isSponsored: false,
    reason: "seed active indicative offer"
  }, superAdminActor);
  app.offers.adminService.validate(activeOffer.id, { validationStatus: "validated", reason: "validate public offer" }, superAdminActor);

  const expiredOffer = app.offers.adminService.create({
    countryId: country.id,
    productId: product.id,
    name: "Auto Expiree",
    indicativePriceMin: 5000,
    currency: "XOF",
    validFrom: "2020-01-01T00:00:00.000Z",
    validUntil: "2021-01-01T00:00:00.000Z",
    reason: "seed expired offer"
  }, superAdminActor);
  app.offers.adminService.validate(expiredOffer.id, { validationStatus: "validated", reason: "validate expired fixture" }, superAdminActor);

  return {
    app,
    countryId: country.id,
    productId: product.id,
    partnerTenantId: partner.id,
    consentTextId: consentText.id,
    formDefinitionId: form.id,
    activeOfferId: activeOffer.id,
    expiredOfferId: expiredOffer.id
  };
}

export function validQuotePayload(seed: ComparatorSeed) {
  return {
    countryCode: "CI",
    productKey: "auto",
    formDefinitionId: seed.formDefinitionId,
    contact: {
      displayName: "Visitor",
      email: "visitor@example.com",
      phone: "+2250102030405"
    },
    answers: { vehicle_use: "prive" },
    consent: {
      accepted: true,
      consentTextId: seed.consentTextId,
      version: "v1",
      contentHash: "hash-lead-transmission-v1"
    },
    ipAddress: "203.0.113.10",
    sessionId: "session-1"
  };
}
