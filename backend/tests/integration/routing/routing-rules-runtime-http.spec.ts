import { afterEach, describe, expect, it } from "vitest";
import {
  leadReassignResponseSchema,
  manualAssignResponseSchema,
  pendingManualQueueResponseSchema,
  routingRuleHistoryResponseSchema,
  routingRuleSchema,
  routingRulesResponseSchema
} from "../../../../packages/shared/contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };

async function seedPartner(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, legalName: string, quotaMonthlyLeads = 0) {
  const partner = await harness.runtime.partners.service.create({
    legalName,
    plan: "pro",
    primaryEmail: `${legalName.replace(/\s+/g, "").toLowerCase()}@broker.example`,
    primaryWhatsApp: "+2250102030405",
    status: "active",
    quotaMonthlyLeads
  }, superAdmin);
  await harness.runtime.partners.service.authorizeCountry(partner.id, seed.country.id, superAdmin);
  await harness.runtime.partners.service.authorizeProduct(partner.id, seed.product.id, superAdmin);
  await harness.runtime.partnerLicenses.service.create({
    partnerTenantId: partner.id,
    licenseNumber: `LIC-${partner.id.slice(0, 8)}`,
    issuingAuthority: "Regulator",
    countryId: seed.country.id,
    productIds: [seed.product.id],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, superAdmin);
  return partner;
}

/** The shared seed also creates an eligible partner; tests park it so only their own partners compete. */
async function seedRoutingRuntime(harness: RuntimeHttpHarness) {
  const seed = await seedPublicRuntime(harness.runtime);
  await harness.runtime.partners.service.update(seed.partner.id, { status: "suspended", suspensionReason: "routing test isolation", reason: "routing test isolates its own partners" }, superAdmin);
  return seed;
}

async function submitQuote(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, suffix: string) {
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: `Visitor ${suffix}`, email: `visitor${suffix}@example.test`, phone: `+22501020304${suffix.padStart(2, "0")}` },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: "runtime-consent-hash" },
      ipAddress: `203.0.113.${suffix}`,
      sessionId: `routing-session-${suffix}`
    })
  });
  expect(response.status).toBe(201);
  return readJson<{ publicReference: string; status: string; routed: boolean }>(response);
}

describe("routing rules runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lets admins create, update and audit rules while refusing brokers and out-of-scope Admin Pays", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedRoutingRuntime(harness);
    const partner = await seedPartner(harness, seed, "Rule Broker");

    const created = await harness.request("/admin/routing-rules", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ countryId: seed.country.id, productId: seed.product.id, mode: "round_robin", reason: "Pilot distribution" })
    });
    expect(created.status).toBe(201);
    const rule = routingRuleSchema.parse(await readJson(created));
    expect(rule).toMatchObject({ mode: "round_robin", status: "active", version: 1 });

    const duplicate = await harness.request("/admin/routing-rules", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ countryId: seed.country.id, productId: seed.product.id, mode: "capacity", reason: "dup" })
    });
    expect(duplicate.status).toBe(409);

    const updated = await harness.request(`/admin/routing-rules/${rule.id}`, {
      method: "PATCH",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ mode: "priority", priorities: [{ partnerTenantId: partner.id, priority: 1 }], reason: "Prefer rule broker" })
    });
    expect(updated.status).toBe(200);
    expect(routingRuleSchema.parse(await readJson(updated)).version).toBe(2);

    const list = routingRulesResponseSchema.parse(await readJson(await harness.request("/admin/routing-rules", { headers: actorHeaders(superAdmin) })));
    expect(list.total).toBe(1);
    const history = routingRuleHistoryResponseSchema.parse(await readJson(await harness.request(`/admin/routing-rules/${rule.id}/history`, { headers: actorHeaders(superAdmin) })));
    expect(history.items.map((entry) => entry.changeType)).toEqual(["updated", "created"]);

    const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await harness.request("/admin/routing-rules", { headers: actorHeaders(broker) })).status).toBe(403);
    const adminPaysSenegal: ActorContext = { actorId: "ap-sn", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["SN"] };
    const outOfScope = await harness.request("/admin/routing-rules", {
      method: "POST",
      headers: { ...actorHeaders(adminPaysSenegal), "content-type": "application/json" },
      body: JSON.stringify({ countryId: seed.country.id, mode: "round_robin", reason: "scope" })
    });
    expect(outOfScope.status).toBe(403);
    const supportAdmin: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
    expect((await harness.request("/admin/routing-rules", { headers: actorHeaders(supportAdmin) })).status).toBe(200);
    const supportWrite = await harness.request(`/admin/routing-rules/${rule.id}`, {
      method: "PATCH",
      headers: { ...actorHeaders(supportAdmin), "content-type": "application/json" },
      body: JSON.stringify({ status: "disabled", reason: "not allowed" })
    });
    expect(supportWrite.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.ruleRefused }).map((entry) => entry.reason)).toEqual(
      expect.arrayContaining(["duplicate_active_rule", "forbidden_role", "out_of_scope_country"])
    );
  });

  it("distributes leads round-robin between eligible partners and respects monthly quotas", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedRoutingRuntime(harness);
    const partnerA = await seedPartner(harness, seed, "Alpha Broker");
    const partnerB = await seedPartner(harness, seed, "Beta Broker");
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, mode: "round_robin", reason: "Fair distribution" });

    await submitQuote(harness, seed, "1");
    await submitQuote(harness, seed, "2");
    const assignments = await harness.runtime.leads.assignments.list();
    expect(assignments.map((assignment) => assignment.partnerTenantId).sort()).toEqual([partnerA.id, partnerB.id].sort());
    expect(assignments.every((assignment) => assignment.assignmentReason === "round_robin_selected")).toBe(true);

    // Capacity mode: a partner whose monthly quota is consumed is excluded, not merely ranked last.
    const limited = await seedPartner(harness, seed, "Limited Broker", 1);
    const rules = await harness.runtime.routingRules.list(superAdmin);
    await harness.runtime.routingRules.update(superAdmin, rules.items[0]!.id, { mode: "priority", priorities: [{ partnerTenantId: limited.id, priority: 1 }], reason: "Prefer limited" });
    await submitQuote(harness, seed, "3");
    await submitQuote(harness, seed, "4");
    const afterQuota = await harness.runtime.leads.assignments.list();
    expect(afterQuota.filter((assignment) => assignment.partnerTenantId === limited.id)).toHaveLength(1);
    const decisions = await harness.runtime.leads.decisions.list();
    const quotaDecisions = decisions.filter((decision) =>
      decision.excludedCandidates.some((candidate) => candidate.partnerTenantId === limited.id && candidate.reasons.includes("partner_quota_exhausted"))
    );
    expect(quotaDecisions).toHaveLength(1);
  });

  it("fails closed for exclusive rules and parks manual rules for admin assignment", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedRoutingRuntime(harness);
    const partnerA = await seedPartner(harness, seed, "Gamma Broker");
    await seedPartner(harness, seed, "Delta Broker");
    const ghost = await harness.runtime.partners.service.create({ legalName: "Ghost Broker", plan: "pro", primaryEmail: "ghost@broker.example", primaryWhatsApp: "+2250102030405", status: "draft", quotaMonthlyLeads: 0 }, superAdmin);
    const rule = await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, mode: "exclusive", exclusivePartnerTenantId: ghost.id, reason: "Exclusive ghost" });

    const blocked = await submitQuote(harness, seed, "5");
    expect(blocked.routed).toBe(false);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(0);
    expect((await harness.runtime.leads.decisions.list())[0]).toMatchObject({ result: "no_broker_available", reasons: ["exclusive_partner_not_eligible"] });

    await harness.runtime.routingRules.update(superAdmin, rule.id, { mode: "manual", reason: "Manual pilot" });
    const parked = await submitQuote(harness, seed, "6");
    expect(parked.routed).toBe(false);
    expect(parked.status).toBe("non_routable");
    const pending = pendingManualQueueResponseSchema.parse(await readJson(await harness.request("/admin/routing/pending", { headers: actorHeaders(superAdmin) })));
    expect(pending.total).toBe(1);
    expect(pending.items[0]?.candidates.filter((candidate) => candidate.eligible)).toHaveLength(2);
    const quoteId = pending.items[0]!.quoteRequestId;

    const publicStatus = await harness.request(`/quote-requests/${parked.publicReference}/status?token=invalid`);
    expect(publicStatus.status).not.toBe(200);

    const ineligible = await harness.request(`/admin/routing/pending/${quoteId}/assign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: ghost.id, reason: "Try inactive partner" })
    });
    expect(ineligible.status).toBe(422);

    const assigned = await harness.request(`/admin/routing/pending/${quoteId}/assign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partnerA.id, reason: "Assign to Gamma" })
    });
    expect(assigned.status).toBe(201);
    expect(manualAssignResponseSchema.parse(await readJson(assigned))).toMatchObject({ partnerTenantId: partnerA.id, status: "routed" });
    expect((await harness.runtime.leads.assignments.list())[0]?.assignmentReason).toContain("admin_manual_assignment");
    expect((await harness.runtime.notifications.service.list()).some((notification) => notification.recipientScope === `partner:${partnerA.id}`)).toBe(true);
    expect(pendingManualQueueResponseSchema.parse(await readJson(await harness.request("/admin/routing/pending", { headers: actorHeaders(superAdmin) }))).total).toBe(0);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.manualAssigned })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.manualAssignmentRefused }).length).toBeGreaterThan(0);
  });

  it("reassigns a lead to another eligible partner with history, audit and notification", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedRoutingRuntime(harness);
    const partnerA = await seedPartner(harness, seed, "Origin Broker");
    const partnerB = await seedPartner(harness, seed, "Target Broker");
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, mode: "exclusive", exclusivePartnerTenantId: partnerA.id, reason: "Start with origin" });
    await submitQuote(harness, seed, "7");
    const [assignment] = await harness.runtime.leads.assignments.list();
    expect(assignment?.partnerTenantId).toBe(partnerA.id);

    const same = await harness.request(`/admin/lead-assignments/${assignment!.id}/reassign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partnerA.id, reason: "No-op" })
    });
    expect(same.status).toBe(409);

    const reassigned = await harness.request(`/admin/lead-assignments/${assignment!.id}/reassign`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partnerB.id, reason: "Origin unavailable" })
    });
    expect(reassigned.status).toBe(201);
    const body = leadReassignResponseSchema.parse(await readJson(reassigned));
    expect(body).toMatchObject({ previousPartnerTenantId: partnerA.id, partnerTenantId: partnerB.id, status: "broker_notified" });

    const moved = await harness.runtime.leads.assignments.require(assignment!.id);
    expect(moved.partnerTenantId).toBe(partnerB.id);
    expect(moved.brokerNotificationId).toBeDefined();
    const history = await harness.runtime.leads.brokerStarterHistory.forLead(assignment!.id);
    expect(history.some((event) => event.eventType === "reassigned")).toBe(true);
    expect(harness.runtime.audit.writer.search({ action: RoutingAuditActions.reassigned })).toHaveLength(1);
    const notifications = await harness.runtime.notifications.service.list();
    expect(notifications.filter((notification) => notification.recipientScope === `partner:${partnerB.id}`)).toHaveLength(1);

    const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: partnerA.id, partnerPlan: "pro", mfaVerified: true };
    const forbidden = await harness.request(`/admin/lead-assignments/${assignment!.id}/reassign`, {
      method: "POST",
      headers: { ...actorHeaders(broker), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partnerA.id, reason: "Take it back" })
    });
    expect(forbidden.status).toBe(403);
  });
});
