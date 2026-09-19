import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { AppModule } from "../../src/app.module";
import { ErrorResponseFilter } from "../../src/modules/common/filters/error-response.filter";
import type { ActorContext } from "../../src/modules/common/types";
import { signActorToken } from "../../src/modules/auth/http-auth-token.service";
import { AssurMatchRuntime } from "../../src/runtime/assurmatch-runtime";

export interface RuntimeHttpHarness {
  app: INestApplication;
  runtime: AssurMatchRuntime;
  baseUrl: string;
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export function actorHeaders(actor: ActorContext): Record<string, string> {
  return {
    authorization: `Bearer ${signActorToken(actor)}`,
    ...(actor.correlationId ? { "x-correlation-id": actor.correlationId } : {})
  };
}

export function simulationActorHeaders(actor: ActorContext): Record<string, string> {
  return {
    ...(actor.actorId ? { "x-assurmatch-actor-id": actor.actorId } : {}),
    "x-assurmatch-roles": actor.roles.join(","),
    ...(actor.partnerTenantId ? { "x-assurmatch-partner-tenant-id": actor.partnerTenantId } : {}),
    ...(actor.partnerPlan ? { "x-assurmatch-partner-plan": actor.partnerPlan } : {}),
    ...(actor.countryScopes?.length ? { "x-assurmatch-country-scopes": actor.countryScopes.join(",") } : {}),
    ...(actor.productScopes?.length ? { "x-assurmatch-product-scopes": actor.productScopes.join(",") } : {}),
    "x-assurmatch-mfa-verified": actor.mfaVerified ? "true" : "false",
    ...(actor.correlationId ? { "x-correlation-id": actor.correlationId } : {})
  };
}

export async function createRuntimeHttpHarness(): Promise<RuntimeHttpHarness> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new ErrorResponseFilter());
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    app,
    runtime: app.get(AssurMatchRuntime),
    baseUrl,
    request(path, init) {
      return fetch(`${baseUrl}${path}`, init);
    },
    close() {
      return app.close();
    }
  };
}

export async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function seedPublicRuntime(runtime: AssurMatchRuntime) {
  const admin: ActorContext = { actorId: "admin-runtime", roles: ["super_admin"], mfaVerified: true };
  await runtime.featureFlags.service.setFlag({
    key: "public_comparator_enabled",
    scopeType: "global",
    value: true,
    reason: "runtime public seed"
  }, admin);
  await runtime.featureFlags.service.setFlag({
    key: "quote_request_enabled",
    scopeType: "global",
    value: true,
    reason: "runtime public seed"
  }, admin);
  const country = await runtime.countries.service.create({
    isoCode: "CI",
    name: "Cote d'Ivoire",
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Abidjan",
    regulatoryFamily: "cima",
    regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
  }, admin);
  await runtime.countries.service.update(country.id, {
    status: "public",
    flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
    reason: "runtime public seed"
  }, admin);
  const product = await runtime.products.service.create({ key: "auto", name: "Assurance auto" }, admin);
  await runtime.products.service.associateCountry(product.id, country.id, admin);
  await runtime.products.service.update(product.id, {
    status: "public",
    flags: {
      product_public_enabled: true,
      product_comparison_enabled: true,
      product_quote_enabled: true,
      product_manual_review_required: false
    },
    reason: "runtime product seed"
  }, admin);
  const consentText = await runtime.consent.service.createText({
    purpose: "lead_transmission",
    countryId: country.id,
    productId: product.id,
    channel: "public_web",
    recipientCategory: "courtier_partenaire_eligible",
    language: "fr",
    version: "v1",
    status: "draft",
    contentHash: "runtime-consent-hash"
  }, admin);
  await runtime.consent.service.publishText(consentText.id, admin);
  const form = await runtime.quoteForms.service.create({
    countryId: country.id,
    productId: product.id,
    language: "fr",
    version: "v1",
    status: "published",
    fields: [{ key: "vehicle_use", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
    consentTextId: consentText.id,
    reason: "runtime form seed"
  }, admin);
  const partner = await runtime.partners.service.create({
    legalName: "Broker CI Runtime",
    primaryEmail: "runtime@broker.example",
    primaryWhatsApp: "+2250102030405",
    status: "active",
    quotaMonthlyLeads: 10
  }, admin);
  await runtime.partners.service.authorizeCountry(partner.id, country.id, admin);
  await runtime.partners.service.authorizeProduct(partner.id, product.id, admin);
  await runtime.partnerLicenses.service.create({
    partnerTenantId: partner.id,
    licenseNumber: "LIC-RUNTIME",
    issuingAuthority: "Regulator",
    countryId: country.id,
    productIds: [product.id],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, admin);
  const offer = await runtime.offers.adminService.create({
    countryId: country.id,
    productId: product.id,
    partnerTenantId: partner.id,
    name: "Auto Runtime",
    indicativePriceMin: 10000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    reason: "runtime offer seed"
  }, admin);
  await runtime.offers.adminService.validate(offer.id, { validationStatus: "validated", reason: "runtime validate" }, admin);
  return { admin, country, product, partner, consentText, form, offer };
}

/**
 * Spec 045: a country that is NOT open to the public but collects e-mail addresses. That pair of
 * flags (`country_waitlist_enabled` on, `country_public_enabled` off) is exactly what
 * `PublicJourneyFlagPolicy` reads as `waitlistOnly`, which is the only state `POST /waitlist` accepts.
 */
export async function seedWaitlistCountry(runtime: AssurMatchRuntime) {
  const admin: ActorContext = { actorId: "admin-runtime", roles: ["super_admin"], mfaVerified: true };
  const country = await runtime.countries.service.create({
    isoCode: "SN",
    name: "Senegal",
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Dakar",
    regulatoryFamily: "cima",
    regulatoryRegimeId: "00000000-0000-4000-8000-000000000011"
  }, admin);
  await runtime.countries.service.update(country.id, {
    status: "internal",
    flags: {
      country_public_enabled: false,
      country_waitlist_enabled: true,
      country_comparison_enabled: false,
      country_quote_enabled: false
    },
    reason: "runtime waitlist seed"
  }, admin);
  return { admin, country };
}

/**
 * Spec 045: opens broker onboarding on an already-seeded country and gives it the three public plan
 * prices. `BillingPlansService.upsert` is gated on `billing_enabled` (it is an admin write), so the
 * flag is flipped on for the seed and back off afterwards - the public plans read deliberately does
 * not consult it, so leaving it off keeps the rest of the harness in its fail-closed default.
 */
export async function seedBrokerOnboarding(runtime: AssurMatchRuntime, isoCode = "CI") {
  const admin: ActorContext = { actorId: "admin-runtime", roles: ["super_admin"], mfaVerified: true };
  const country = await runtime.countries.service.findByIsoCode(isoCode);
  if (!country) throw new Error(`seedBrokerOnboarding requires country ${isoCode} to be seeded first`);
  // `countryUpdateSchema` keeps zod defaults on `status` and `flags`, so an update that omits them
  // silently resets the country to draft with the default (all-false) flag set: both are restated.
  await runtime.countries.service.update(country.id, {
    status: country.status,
    flags: { ...country.flags, country_broker_onboarding_enabled: true },
    reason: "runtime broker onboarding seed"
  }, admin);
  // `billing_enabled` is a sensitive flag: `setFlag` refuses it outright, and the compliance-policy
  // path is the one the module documents for seeds, ops scripts and tests.
  await runtime.featureFlags.service.applyCompliancePolicy({
    key: "billing_enabled",
    scopeType: "global",
    value: true,
    reason: "runtime plan price seed"
  }, admin, { reference: "TEST-SEED-045", approvedBy: "runtime-test-harness" });
  const prices = [
    { plan: "starter" as const, monthlySubscription: 25_000, perLeadPrice: 1_500, setupFee: 50_000 },
    { plan: "pro" as const, monthlySubscription: 75_000, perLeadPrice: 1_200, setupFee: 100_000 },
    { plan: "enterprise" as const, monthlySubscription: 250_000, perLeadPrice: 900, setupFee: 250_000 }
  ];
  for (const price of prices) {
    await runtime.billing.plans.upsert({
      ...price,
      countryCode: isoCode,
      sharedLeadPriceMultiplier: 0.5,
      reason: "runtime public plan price seed"
    }, admin);
  }
  await runtime.featureFlags.service.applyCompliancePolicy({
    key: "billing_enabled",
    scopeType: "global",
    value: false,
    reason: "runtime plan price seed completed"
  }, admin, { reference: "TEST-SEED-045", approvedBy: "runtime-test-harness" });
  return { admin, country, prices };
}
