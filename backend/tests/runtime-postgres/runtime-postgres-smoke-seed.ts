import type { AssurMatchRuntime } from "../../src/runtime/assurmatch-runtime";
import type { ActorContext } from "../../src/modules/common/types";
import type { RuntimeSmokeRun } from "./runtime-postgres-smoke-data";

export interface RuntimeSmokeSeed {
  countryId: string;
  productId: string;
  offerId: string;
  consentTextId: string;
  consentContentHash: string;
  consentVersion: string;
  formDefinitionId: string;
  eligiblePartnerId: string;
  starterPartnerAId: string;
  starterPartnerBId: string;
  proPartnerId: string;
  starterLeadAId: string;
  proLeadId: string;
}

export async function seedRuntimeSmokeData(runtime: AssurMatchRuntime, run: RuntimeSmokeRun, admin: ActorContext): Promise<RuntimeSmokeSeed> {
  await runtime.featureFlags.service.setFlag({
    key: "public_comparator_enabled",
    scopeType: "global",
    value: true,
    reason: "runtime smoke public catalog activation"
  }, admin);
  await runtime.featureFlags.service.setFlag({
    key: "quote_request_enabled",
    scopeType: "global",
    value: true,
    reason: "runtime smoke quote activation"
  }, admin);
  await runtime.reloadRuntimeFeatureFlags();

  const country = await runtime.countries.service.create({
    isoCode: run.countryCode,
    name: `${run.prefix} Country`,
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Abidjan",
    regulatoryFamily: "cima",
    regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
  }, admin);
  await runtime.countries.service.update(country.id, {
    status: "public",
    flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
    reason: "runtime smoke country activation"
  }, admin);

  const product = await runtime.products.service.create({
    key: run.productKey,
    name: `${run.prefix} Assurance auto`,
    requiresManualReview: false
  }, admin);
  await runtime.products.service.associateCountry(product.id, country.id, admin);
  await runtime.products.service.update(product.id, {
    status: "public",
    flags: {
      product_public_enabled: true,
      product_comparison_enabled: true,
      product_quote_enabled: true,
      product_manual_review_required: false
    },
    reason: "runtime smoke product activation"
  }, admin);

  const eligiblePartner = await createBroker(runtime, run, admin, "Eligible", "starter");
  await authorizeBroker(runtime, eligiblePartner.id, country.id, product.id, admin);

  const offer = await runtime.offers.adminService.create({
    countryId: country.id,
    productId: product.id,
    partnerTenantId: eligiblePartner.id,
    publicKey: `${run.id}-offer`,
    name: `${run.prefix} Offre indicative`,
    indicativePriceMin: 10000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    publicDisclaimers: ["offre indicative", "prix a confirmer par le courtier partenaire"],
    reason: "runtime smoke offer seed"
  }, admin);
  await runtime.offers.adminService.validate(offer.id, { validationStatus: "validated", reason: "runtime smoke offer validation" }, admin);

  const consentText = await runtime.consent.service.createText({
    purpose: "lead_transmission",
    countryId: country.id,
    productId: product.id,
    channel: "public_web",
    recipientCategory: "courtier_partenaire_eligible",
    language: "fr",
    version: `v-${run.id}`,
    status: "draft",
    contentHash: `${run.id}-consent-hash`
  }, admin);
  await runtime.consent.service.publishText(consentText.id, admin);
  const form = runtime.quoteForms.service.create({
    countryId: country.id,
    productId: product.id,
    language: "fr",
    version: `v-${run.id}`,
    status: "published",
    fields: [{ key: "vehicle_use", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
    consentTextId: consentText.id,
    reason: "runtime smoke quote form seed"
  }, admin);

  const starterA = await createBroker(runtime, run, admin, "Starter A", "starter");
  const starterB = await createBroker(runtime, run, admin, "Starter B", "starter");
  const pro = await createBroker(runtime, run, admin, "Pro", "pro");
  const starterLeadA = await runtime.leads.assignments.create({
    quoteRequestId: crypto.randomUUID(),
    partnerTenantId: starterA.id,
    assignmentReason: "runtime_smoke_tenant_isolation",
    publicReference: `${run.id}-starter-a`,
    countryCode: run.countryCode,
    productKey: run.productKey,
    contact: { displayName: `${run.prefix} Starter Lead`, email: run.email, phone: run.phone },
    answers: { vehicle_use: "prive" }
  }, admin);
  const proLead = await runtime.leads.assignments.create({
    quoteRequestId: crypto.randomUUID(),
    partnerTenantId: pro.id,
    assignmentReason: "runtime_smoke_crm",
    publicReference: `${run.id}-pro`,
    countryCode: run.countryCode,
    productKey: run.productKey,
    contact: { displayName: `${run.prefix} Pro Lead`, email: `pro-${run.email}`, phone: run.phone },
    answers: { vehicle_use: "prive" }
  }, admin);

  return {
    countryId: country.id,
    productId: product.id,
    offerId: offer.id,
    consentTextId: consentText.id,
    consentContentHash: consentText.contentHash,
    consentVersion: consentText.version,
    formDefinitionId: form.id,
    eligiblePartnerId: eligiblePartner.id,
    starterPartnerAId: starterA.id,
    starterPartnerBId: starterB.id,
    proPartnerId: pro.id,
    starterLeadAId: starterLeadA.id,
    proLeadId: proLead.id
  };
}

async function createBroker(runtime: AssurMatchRuntime, run: RuntimeSmokeRun, admin: ActorContext, label: string, plan: "starter" | "pro") {
  return runtime.partners.service.create({
    legalName: `${run.prefix} Broker ${label}`,
    primaryEmail: `${run.id}-${label.toLowerCase().replace(/\s+/g, "-")}@broker.example.test`,
    primaryWhatsApp: "+2250102030405",
    plan,
    status: "active",
    quotaMonthlyLeads: 50
  }, admin);
}

async function authorizeBroker(runtime: AssurMatchRuntime, partnerTenantId: string, countryId: string, productId: string, admin: ActorContext): Promise<void> {
  await runtime.partners.service.authorizeCountry(partnerTenantId, countryId, admin);
  await runtime.partners.service.authorizeProduct(partnerTenantId, productId, admin);
  await runtime.partnerLicenses.service.create({
    partnerTenantId,
    licenseNumber: `LIC-${partnerTenantId.slice(0, 8)}`,
    issuingAuthority: "Runtime Smoke Regulator",
    countryId,
    productIds: [productId],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, admin);
}
