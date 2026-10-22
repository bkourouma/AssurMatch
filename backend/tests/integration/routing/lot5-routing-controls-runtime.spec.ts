import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { RapidDisableService } from "../../../src/modules/feature-flags/rapid-disable.service";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import { seedAcceptedAccreditation, seedOwnerAndContract } from "../helpers/partner-onboarding-seed";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };
const QUALITY_ENV = "ASSURMATCH_ROUTING_LEAD_QUALITY_MIN_SCORE";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

async function submitQuote(harness: RuntimeHttpHarness, seed: Seed, suffix: string) {
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: `Visitor ${suffix}`, email: `visitor${suffix}@example.test`, phone: `+22501020304${suffix.padStart(2, "0")}` },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
      ipAddress: `203.0.113.${suffix}`,
      sessionId: `lot5-routing-${suffix}`
    })
  });
  expect(response.status).toBe(201);
  return readJson<{ publicReference: string; status: string; routed: boolean }>(response);
}

/** An eligible broker (licence, authorisations, accepted proof) with or without its partnership contract. */
async function seedBroker(harness: RuntimeHttpHarness, seed: Seed, legalName: string, options: { quota?: number; contract?: boolean } = {}) {
  const partner = await harness.runtime.partners.service.create({
    legalName,
    plan: "pro",
    primaryEmail: `${legalName.replace(/\s+/g, "").toLowerCase()}@broker.example`,
    primaryWhatsApp: "+2250102030405",
    status: "active",
    quotaMonthlyLeads: options.quota ?? 0
  }, superAdmin);
  await harness.runtime.partners.service.authorizeCountry(partner.id, seed.country.id, superAdmin);
  await harness.runtime.partners.service.authorizeProduct(partner.id, seed.product.id, superAdmin);
  const license = await harness.runtime.partnerLicenses.service.create({
    partnerTenantId: partner.id,
    licenseNumber: `LIC-${partner.id.slice(0, 8)}`,
    issuingAuthority: "Regulator",
    countryId: seed.country.id,
    productIds: [seed.product.id],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, superAdmin);
  await seedAcceptedAccreditation(harness.runtime, partner.id, license.id);
  if (options.contract !== false) await seedOwnerAndContract(harness.runtime, partner.id, { plan: "pro" });
  return partner;
}

/** The shared seed also creates a broker; it is parked so only the test's own brokers compete. */
async function seedIsolatedRuntime(harness: RuntimeHttpHarness) {
  const seed = await seedPublicRuntime(harness.runtime);
  await harness.runtime.partners.service.update(seed.partner.id, { status: "suspended", suspensionReason: "routing test isolation", reason: "routing test isolates its own brokers" }, superAdmin);
  return seed;
}

const lastDecision = async (harness: RuntimeHttpHarness) => (await harness.runtime.leads.decisions.list()).at(-1);

describe("lot 5 (spec 071) routing controls on the runtime", () => {
  let harness: RuntimeHttpHarness | undefined;

  // Control 9 is exercised for real here: the shared harness otherwise relaxes it for the other suites.
  beforeEach(() => {
    process.env.ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT = "true";
    process.env[QUALITY_ENV] = "30";
  });

  afterEach(async () => {
    delete process.env.ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT;
    delete process.env[QUALITY_ENV];
    await harness?.close();
    harness = undefined;
  });

  it("control 9: excludes a broker without a recorded contract or past its contract expiry, and audits each exclusion", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedIsolatedRuntime(harness);
    const broker = await seedBroker(harness, seed, "Contract Broker", { contract: false });

    // Missing contract: excluded, never silently routed; the exclusion is audited with its reason.
    const missing = await submitQuote(harness, seed, "1");
    expect(missing.routed).toBe(false);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(0);
    const missingDecision = await lastDecision(harness);
    expect(missingDecision).toMatchObject({ result: "no_broker_available" });
    expect(missingDecision?.excludedCandidates.find((candidate) => candidate.partnerTenantId === broker.id)?.reasons).toEqual(["contract_missing"]);
    const excluded = harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingBrokerExcluded });
    const brokerEvent = excluded.find((entry) => entry.targetId === broker.id);
    expect(brokerEvent).toMatchObject({ action: "routing.broker_excluded", result: "refused" });
    expect(brokerEvent?.context?.reasons).toEqual(["contract_missing"]);
    expect(String(brokerEvent?.reason)).toContain("contract_missing");

    // Recording the contract makes the broker routable again.
    await seedOwnerAndContract(harness.runtime, broker.id, { plan: "pro" });
    expect((await submitQuote(harness, seed, "2")).routed).toBe(true);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(1);

    // Expired contract window set by finance: excluded with contract_expired.
    const subscriptions = harness.runtime.billing.subscriptions;
    await subscriptions.update(finance, broker.id, { status: "active", contractExpiresAt: "2020-01-01", reason: "Contrat arrive a echeance" });
    expect((await submitQuote(harness, seed, "3")).routed).toBe(false);
    const expiredDecision = await lastDecision(harness);
    expect(expiredDecision?.excludedCandidates.find((candidate) => candidate.partnerTenantId === broker.id)?.reasons).toEqual(["contract_expired"]);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingBrokerExcluded }).filter((entry) => entry.targetId === broker.id).at(-1)?.context?.reasons).toEqual(["contract_expired"]);

    // A future expiry or a cleared expiry keeps the broker routable.
    await subscriptions.update(finance, broker.id, { status: "active", contractExpiresAt: "2999-12-31", reason: "Contrat renouvele" });
    expect((await submitQuote(harness, seed, "4")).routed).toBe(true);
    await subscriptions.update(finance, broker.id, { status: "active", contractExpiresAt: null, reason: "Contrat sans echeance" });
    expect((await submitQuote(harness, seed, "5")).routed).toBe(true);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(3);
  });

  it("control 12: a lead under the quality threshold waits in the manual queue and never excludes a broker", async () => {
    // Every scored request is below 100 here (the grid reserves points the form never earns together).
    process.env[QUALITY_ENV] = "100";
    harness = await createRuntimeHttpHarness();
    const seed = await seedIsolatedRuntime(harness);
    const broker = await seedBroker(harness, seed, "Quality Broker");

    const result = await submitQuote(harness, seed, "1");
    expect(result.routed).toBe(false);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(0);
    const decision = await lastDecision(harness);
    expect(decision?.result).toBe("pending_manual_assignment");
    expect(decision?.reasons).toEqual(expect.arrayContaining(["manual_assignment_required", "lead_quality_below_threshold"]));
    // The broker is NOT excluded: the quality control only parks the lead.
    expect(decision?.excludedCandidates.map((candidate) => candidate.partnerTenantId)).not.toContain(broker.id);
    expect(decision?.controlDetails).toMatchObject({ qualityThreshold: 100, parkedReasons: ["lead_quality_below_threshold"] });
    expect(decision?.controlDetails?.qualityScore).toBeGreaterThan(0);
    expect(decision?.controlDetails?.qualityScore).toBeLessThan(100);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.leadQualityReview })[0]).toMatchObject({ reason: "lead_quality_below_threshold" });
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingBrokerExcluded }).filter((entry) => entry.targetId === broker.id)).toHaveLength(0);

    // The request is in the admin queue and an admin can still assign it.
    const queue = await readJson<{ total: number; items: Array<{ quoteRequestId: string }> }>(await harness.request("/admin/routing/pending", { headers: actorHeaders(superAdmin) }));
    expect(queue.total).toBe(1);
    const assigned = await harness.request(`/admin/routing/pending/${queue.items[0]?.quoteRequestId}/assign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: broker.id, reason: "Revue manuelle du lead" })
    });
    expect(assigned.status).toBe(201);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(1);
  });

  it("control 12: the default threshold (30) lets a complete request through", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedIsolatedRuntime(harness);
    await seedBroker(harness, seed, "Default Quality Broker");
    expect((await submitQuote(harness, seed, "1")).routed).toBe(true);
    expect((await lastDecision(harness))?.controlDetails?.qualityScore).toBeGreaterThanOrEqual(30);
  });

  it("quota lock: simultaneous submissions never exceed the monthly quota", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedIsolatedRuntime(harness);
    const limited = await seedBroker(harness, seed, "Limited Broker", { quota: 2 });

    const outcomes = await Promise.all(["1", "2", "3", "4", "5"].map((suffix) => submitQuote(harness as RuntimeHttpHarness, seed, suffix)));
    expect(outcomes.filter((outcome) => outcome.routed)).toHaveLength(2);
    const assignments = await harness.runtime.leads.assignments.list();
    expect(assignments.filter((assignment) => assignment.partnerTenantId === limited.id)).toHaveLength(2);
    const decisions = await harness.runtime.leads.decisions.list();
    expect(decisions).toHaveLength(5);
    expect(decisions.filter((decision) => decision.result === "assigned")).toHaveLength(2);
    const refused = decisions.filter((decision) => decision.result === "no_broker_available");
    expect(refused).toHaveLength(3);
    for (const decision of refused) {
      expect(decision.excludedCandidates.find((candidate) => candidate.partnerTenantId === limited.id)?.reasons).toContain("partner_quota_exhausted");
    }
    // A quota exhausted at routing time is reported by the exclusion audit as well.
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingBrokerExcluded }).filter((entry) => entry.targetId === limited.id)).toHaveLength(3);
  });

  it("refuses to activate ai_assisted_routing_enabled through the admin feature flag route (compliance policy only)", async () => {
    harness = await createRuntimeHttpHarness();
    await seedIsolatedRuntime(harness);
    const flag = await new RapidDisableService(harness.runtime.featureFlags.service).disable("global", undefined, "ai_assisted_routing_enabled", "seed disabled flag", superAdmin);
    expect(flag.value).toBe(false);
    const response = await harness.request(`/admin/feature-flags/${flag.id}`, {
      method: "PATCH",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ value: true, reason: "tentative d'activation de l'assistance IA" })
    });
    expect(response.status).toBe(403);
    expect(harness.runtime.featureFlags.service.isEnabled("ai_assisted_routing_enabled")).toBe(false);
  });

  it("mode ai_assisted: closed by default (plain manual parking), then open: a suggestion is attached but nothing is ever assigned", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedIsolatedRuntime(harness);
    const alpha = await seedBroker(harness, seed, "Alpha Broker");
    const beta = await seedBroker(harness, seed, "Beta Broker");
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, mode: "ai_assisted", reason: "Pilote assistance IA" });
    expect(harness.runtime.featureFlags.service.isEnabled("ai_assisted_routing_enabled")).toBe(false);

    const closed = await submitQuote(harness, seed, "1");
    expect(closed.routed).toBe(false);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(0);
    const closedDecision = await lastDecision(harness);
    expect(closedDecision).toMatchObject({ result: "pending_manual_assignment" });
    expect(closedDecision?.reasons).toEqual(["manual_assignment_required", "ai_assisted_routing_disabled"]);
    expect(closedDecision?.controlDetails?.aiSuggestion).toBeUndefined();
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.aiSuggestionGenerated })).toHaveLength(0);

    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "ai_assisted_routing_enabled", scopeType: "global", value: true, reason: "ouverture du pilote IA assistee" }, superAdmin, { reference: "TEST-071-AI", approvedBy: "compliance" });
    expect(harness.runtime.featureFlags.service.isEnabled("ai_assisted_routing_enabled")).toBe(true);
    const open = await submitQuote(harness, seed, "2");
    expect(open.routed).toBe(false);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(0);
    const openDecision = await lastDecision(harness);
    expect(openDecision?.result).toBe("pending_manual_assignment");
    expect(openDecision?.selectedPartnerTenantId).toBeUndefined();
    expect(openDecision?.reasons).toEqual(["manual_assignment_required", "ai_suggestion_pending"]);
    const suggestion = openDecision?.controlDetails?.aiSuggestion;
    expect([alpha.id, beta.id]).toContain(suggestion?.partnerTenantId);
    expect(suggestion?.provider).toBe("template");
    const generated = harness.runtime.audit.writer.search({ action: RoutingAuditActions.aiSuggestionGenerated });
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ result: "success", context: { mode: "ai_assisted", assistance: true, applied: false } });
    expect(JSON.stringify(generated[0])).not.toContain("visitor2@example.test");

    // Only the human assignment creates the lead.
    const assigned = await harness.request(`/admin/routing/pending/${openDecision?.quoteRequestId}/assign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: suggestion?.partnerTenantId, reason: "Suggestion retenue apres verification" })
    });
    expect(assigned.status).toBe(201);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(1);
  });

  /** The admin queue carries the AI suggestion and the quality score (ManualRoutingService receives the routing decisions). */
  it("mode ai_assisted: the admin queue shows the suggestion and following it is audited as validated", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedIsolatedRuntime(harness);
    const broker = await seedBroker(harness, seed, "Solo Broker");
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, mode: "ai_assisted", reason: "Pilote assistance IA" });
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "ai_assisted_routing_enabled", scopeType: "global", value: true, reason: "ouverture du pilote IA assistee" }, superAdmin, { reference: "TEST-071-AI", approvedBy: "compliance" });
    await submitQuote(harness, seed, "1");

    const queue = await readJson<{ items: Array<{ quoteRequestId: string; qualityScore: number | null; aiSuggestion: { partnerTenantId: string } | null }> }>(await harness.request("/admin/routing/pending", { headers: actorHeaders(superAdmin) }));
    expect(queue.items[0]?.aiSuggestion?.partnerTenantId).toBe(broker.id);
    expect(queue.items[0]?.qualityScore).toBeGreaterThanOrEqual(30);
    const assigned = await harness.request(`/admin/routing/pending/${queue.items[0]?.quoteRequestId}/assign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: broker.id, reason: "Suggestion retenue apres verification" })
    });
    expect(assigned.status).toBe(201);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.aiSuggestionValidated })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.aiSuggestionDiverged })).toHaveLength(0);
  });
});
