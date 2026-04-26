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

export function seedPublicRuntime(runtime: AssurMatchRuntime) {
  const admin: ActorContext = { actorId: "admin-runtime", roles: ["super_admin"], mfaVerified: true };
  const country = runtime.countries.service.create({
    isoCode: "CI",
    name: "Cote d'Ivoire",
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Abidjan",
    regulatoryFamily: "cima",
    regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
  }, admin);
  runtime.countries.service.update(country.id, {
    status: "public",
    flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
    reason: "runtime public seed"
  }, admin);
  const product = runtime.products.service.create({ key: "auto", name: "Assurance auto" }, admin);
  runtime.products.service.associateCountry(product.id, country.id, admin);
  runtime.products.service.update(product.id, {
    status: "public",
    flags: {
      product_public_enabled: true,
      product_comparison_enabled: true,
      product_quote_enabled: true,
      product_manual_review_required: false
    },
    reason: "runtime product seed"
  }, admin);
  const consentText = runtime.consent.service.createText({
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
  runtime.consent.service.publishText(consentText.id, admin);
  const form = runtime.quoteForms.service.create({
    countryId: country.id,
    productId: product.id,
    language: "fr",
    version: "v1",
    status: "published",
    fields: [{ key: "vehicle_use", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
    consentTextId: consentText.id,
    reason: "runtime form seed"
  }, admin);
  const partner = runtime.partners.service.create({
    legalName: "Broker CI Runtime",
    primaryEmail: "runtime@broker.example",
    primaryWhatsApp: "+2250102030405",
    status: "active",
    quotaMonthlyLeads: 10
  }, admin);
  runtime.partners.service.authorizeCountry(partner.id, country.id, admin);
  runtime.partners.service.authorizeProduct(partner.id, product.id, admin);
  runtime.partnerLicenses.service.create({
    partnerTenantId: partner.id,
    licenseNumber: "LIC-RUNTIME",
    issuingAuthority: "Regulator",
    countryId: country.id,
    productIds: [product.id],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, admin);
  const offer = runtime.offers.adminService.create({
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
  runtime.offers.adminService.validate(offer.id, { validationStatus: "validated", reason: "runtime validate" }, admin);
  return { admin, country, product, partner, consentText, form, offer };
}
