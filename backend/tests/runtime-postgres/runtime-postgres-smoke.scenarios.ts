import assert from "node:assert/strict";
import type { AssurMatchRuntime } from "../../src/runtime/assurmatch-runtime";
import type { RuntimePostgresSmokeHarness } from "./runtime-postgres-smoke-harness";
import { readJson } from "./runtime-postgres-smoke-harness";
import { assertAuditExists, assertPrismaRuntimeRepositories, assertSensitiveFlagsFailClosed } from "./runtime-postgres-smoke-assertions";
import { adminActor, authHeaders, proActor, starterActor, type RuntimeSmokeRun } from "./runtime-postgres-smoke-data";
import type { RuntimeSmokePrismaClient } from "./runtime-postgres-smoke-prisma";
import { seedRuntimeSmokeData, type RuntimeSmokeSeed } from "./runtime-postgres-smoke-seed";

interface RuntimeSmokeState {
  seed?: RuntimeSmokeSeed;
  consentedQuoteId?: string;
}

interface PageResponse<T> {
  items: T[];
  total: number;
}

function responseItems<T>(response: T[] | PageResponse<T>): T[] {
  return Array.isArray(response) ? response : response.items;
}

export async function runRuntimePostgresSmokeScenarios(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun): Promise<void> {
  const state: RuntimeSmokeState = {};
  await smokeHealthAndRepositoryRuntime(harness, run);
  state.seed = await smokeSeedAndCatalog(harness, run);
  await smokeQuoteWithConsent(harness, run, state);
  await smokeQuoteWithoutConsent(harness, run);
  await smokeStarterTenantIsolation(harness, run, state);
  await smokeBrokerCrmFlagBehavior(harness, run, state);
  await smokePersistedFeatureFlags(harness.prisma);
  await smokeDurableAudit(harness, run);
}

async function smokeHealthAndRepositoryRuntime(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun): Promise<void> {
  assertPrismaRuntimeRepositories(harness.runtime.runtimeRepositoryModes());
  const response = await harness.request("/admin/system/health", { headers: authHeaders(adminActor(run)) });
  assert.equal(response.status, 200, `health endpoint should succeed, got ${response.status}`);
  const body = await readJson<Record<string, unknown>>(response);
  assert.ok(body, "health endpoint should return a response body");
}

async function smokeSeedAndCatalog(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun): Promise<RuntimeSmokeSeed> {
  const seed = await seedRuntimeSmokeData(harness.runtime, run, adminActor(run));

  const countriesResponse = await harness.request("/countries");
  assert.equal(countriesResponse.status, 200, `GET /countries should succeed, got ${countriesResponse.status}`);
  const countries = await readJson<Array<{ id: string; isoCode: string }>>(countriesResponse);
  assert.ok(countries.some((country) => country.id === seed.countryId && country.isoCode === run.countryCode), "smoke country should be served from PostgreSQL");

  const productsResponse = await harness.request(`/countries/${run.countryCode}/products`);
  assert.equal(productsResponse.status, 200, `GET products should succeed, got ${productsResponse.status}`);
  const products = await readJson<Array<{ id: string; key: string }>>(productsResponse);
  assert.ok(products.some((product) => product.id === seed.productId && product.key === run.productKey), "smoke product should be served from PostgreSQL");

  const offersResponse = await harness.request(`/countries/${run.countryCode}/products/${run.productKey}/offers`);
  assert.equal(offersResponse.status, 200, `GET offers should succeed, got ${offersResponse.status}`);
  const offers = responseItems(await readJson<Array<{ id: string; name: string }> | PageResponse<{ id: string; name: string }>>(offersResponse));
  assert.ok(offers.some((offer) => offer.id === seed.offerId), "smoke offer should be served from PostgreSQL");

  const dbOffer = await harness.prisma.offer.findUnique({ where: { id: seed.offerId } });
  assert.ok(dbOffer, "smoke offer should exist in PostgreSQL");
  assert.equal(dbOffer.name.includes(run.prefix), true, "HTTP offer must correspond to smoke DB row");

  return seed;
}

async function smokeQuoteWithConsent(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun, state: RuntimeSmokeState): Promise<void> {
  const seed = requireSeed(state);
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-correlation-id": run.correlationId },
    body: JSON.stringify({
      countryCode: run.countryCode,
      productKey: run.productKey,
      selectedOfferId: seed.offerId,
      formDefinitionId: seed.formDefinitionId,
      contact: { displayName: `${run.prefix} Prospect`, email: run.email, phone: run.phone },
      answers: { vehicle_use: "prive" },
      consent: {
        accepted: true,
        consentTextId: seed.consentTextId,
        version: seed.consentVersion,
        contentHash: seed.consentContentHash
      },
      sessionId: `${run.id}-session`,
      ipAddress: "127.0.0.1"
    })
  });
  assert.equal(response.status, 201, `POST /quote-requests with consent should succeed, got ${response.status}`);
  const body = await readJson<{ publicReference: string; routed: boolean }>(response);
  assert.ok(body.publicReference, "quote response should include publicReference");

  const quote = await harness.prisma.quoteRequest.findUnique({ where: { publicReference: body.publicReference } });
  assert.ok(quote, "QuoteRequest should be persisted");
  state.consentedQuoteId = quote.id;
  const prospect = await harness.prisma.prospect.findUnique({ where: { id: quote.prospectId } });
  assert.ok(prospect, "Prospect should be persisted");
  const consent = await harness.prisma.consentRecord.findUnique({ where: { id: quote.consentRecordId } });
  assert.ok(consent, "ConsentRecord should be persisted");
  const assignment = await harness.prisma.leadAssignment.findUnique({ where: { quoteRequestId: quote.id } });
  assert.ok(assignment, "LeadAssignment should be persisted for eligible broker");
  const decision = await harness.prisma.routingDecision.findFirst({ where: { quoteRequestId: quote.id } });
  assert.ok(decision, "RoutingDecision should be persisted for routed quote");
  await assertAuditExists(harness.prisma, run);
}

async function smokeQuoteWithoutConsent(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun): Promise<void> {
  const beforeAssignments = await harness.prisma.leadAssignment.count();
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-correlation-id": `${run.correlationId}-no-consent` },
    body: JSON.stringify({
      countryCode: run.countryCode,
      productKey: run.productKey,
      formDefinitionId: crypto.randomUUID(),
      contact: { displayName: `${run.prefix} No Consent`, email: `no-consent-${run.email}`, phone: run.phone },
      answers: { vehicle_use: "prive" }
    })
  });
  assert.ok(response.status >= 400, `POST /quote-requests without consent should be refused, got ${response.status}`);
  const afterAssignments = await harness.prisma.leadAssignment.count();
  assert.equal(afterAssignments, beforeAssignments, "No-consent refusal must not create a LeadAssignment");
  const noConsentProspect = await harness.prisma.prospect.findFirst({ where: { emailNormalized: `no-consent-${run.email}` } });
  assert.equal(noConsentProspect, null, "No-consent refusal must not create a Prospect");
}

async function smokeStarterTenantIsolation(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun, state: RuntimeSmokeState): Promise<void> {
  const seed = requireSeed(state);
  const actorA = starterActor(run, seed.starterPartnerAId, `${run.id}-starter-a`);
  const actorB = starterActor(run, seed.starterPartnerBId, `${run.id}-starter-b`);

  const responseA = await harness.request("/broker/starter/leads", { headers: authHeaders(actorA) });
  assert.equal(responseA.status, 200, `Starter A leads should succeed, got ${responseA.status}`);
  const pageA = await readJson<PageResponse<{ leadAssignmentId: string }>>(responseA);
  assert.ok(pageA.items.some((lead) => lead.leadAssignmentId === seed.starterLeadAId), "Starter A should see its lead");

  const responseB = await harness.request("/broker/starter/leads", { headers: authHeaders(actorB) });
  assert.equal(responseB.status, 200, `Starter B leads should succeed, got ${responseB.status}`);
  const pageB = await readJson<PageResponse<{ leadAssignmentId: string }>>(responseB);
  assert.equal(pageB.items.some((lead) => lead.leadAssignmentId === seed.starterLeadAId), false, "Starter B must not see Starter A lead");
}

async function smokeBrokerCrmFlagBehavior(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun, state: RuntimeSmokeState): Promise<void> {
  const seed = requireSeed(state);
  const actor = proActor(run, seed.proPartnerId);
  await setBrokerCrmFlag(harness.runtime, true, run);
  const enabledResponse = await harness.request("/broker/crm/leads", { headers: authHeaders(actor) });
  assert.equal(enabledResponse.status, 200, `CRM leads should succeed when broker_crm_enabled=true, got ${enabledResponse.status}`);
  const enabledPage = await readJson<PageResponse<{ leadAssignmentId: string }>>(enabledResponse);
  assert.ok(enabledPage.items.some((lead) => lead.leadAssignmentId === seed.proLeadId), "Pro broker should see CRM lead when flag is true");

  await setBrokerCrmFlag(harness.runtime, false, run);
  const disabledResponse = await harness.request("/broker/crm/leads", { headers: authHeaders(actor) });
  assert.ok(disabledResponse.status >= 400, `CRM leads should be refused when broker_crm_enabled=false, got ${disabledResponse.status}`);
}

async function smokePersistedFeatureFlags(prisma: RuntimeSmokePrismaClient): Promise<void> {
  await assertSensitiveFlagsFailClosed(prisma);
  const crmFlag = await prisma.featureFlag.findFirst({ where: { key: "broker_crm_enabled", scopeType: "global" } });
  assert.ok(crmFlag, "broker_crm_enabled should be persisted by the smoke scenario");
  assert.equal(crmFlag.value, false, "broker_crm_enabled should finish fail-closed after disabled scenario");
}

async function smokeDurableAudit(harness: RuntimePostgresSmokeHarness, run: RuntimeSmokeRun): Promise<void> {
  await assertAuditExists(harness.prisma, run);
  const response = await harness.request("/admin/audit-logs", { headers: authHeaders(adminActor(run)) });
  assert.equal(response.status, 200, `admin audit logs should be readable by authorized admin, got ${response.status}`);
  const logs = await readJson<Array<{ correlationId?: string }>>(response);
  assert.ok(logs.some((log) => log.correlationId === run.correlationId), "admin audit endpoint should return smoke audit logs");
}

async function setBrokerCrmFlag(runtime: AssurMatchRuntime, value: boolean, run: RuntimeSmokeRun): Promise<void> {
  await runtime.featureFlags.service.setFlag({
    key: "broker_crm_enabled",
    scopeType: "global",
    value,
    reason: `runtime smoke broker_crm_enabled ${value ? "enabled" : "disabled"}`
  }, adminActor(run));
  await runtime.reloadRuntimeFeatureFlags();
}

function requireSeed(state: RuntimeSmokeState): RuntimeSmokeSeed {
  assert.ok(state.seed, "Runtime smoke seed must be created before this scenario");
  return state.seed;
}
