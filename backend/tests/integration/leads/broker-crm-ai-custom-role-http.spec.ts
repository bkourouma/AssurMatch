import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { partnerCustomRoleSchema } from "../../../../packages/shared/contracts/enterprise.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { brokerUser } from "../broker-self-service/self-service-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 3 (spec 069 FR-004/FR-008) x spec 064: a custom role without broker_crm:read never reaches the CRM AI routes nor a priority score.
const TENANT = "00000000-0000-4000-8000-000000069c01";
const json = { "content-type": "application/json" };
const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
const enterprise = (actor: ActorContext): ActorContext => ({ ...actor, partnerPlan: "enterprise" });

describe("spec 069 CRM AI routes under a custom role without broker_crm:read", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(() => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
  });

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    if (previousCrmFlag === undefined) delete process.env.ASSURMATCH_BROKER_CRM_ENABLED;
    else process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  const get = (h: RuntimeHttpHarness, actor: ActorContext, path: string) => h.request(path, { headers: actorHeaders(actor) });
  const post = (h: RuntimeHttpHarness, actor: ActorContext, path: string, body: unknown = {}) =>
    h.request(path, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });

  async function createRole(h: RuntimeHttpHarness, owner: ActorContext, name: string, permissions: string[]) {
    const response = await post(h, owner, "/broker/enterprise/roles", { name, permissions, reason: "Restriction interne" });
    expect(response.status).toBe(201);
    return partnerCustomRoleSchema.parse(await readJson(response));
  }

  async function assign(h: RuntimeHttpHarness, owner: ActorContext, userId: string, customRoleId: string | null) {
    const response = await h.request(`/broker/enterprise/members/${userId}/custom-role`, { method: "PUT", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ customRoleId, reason: "Perimetre spec 069" }) });
    expect(response.status).toBe(200);
  }

  it("refuses priority scores, performance summary and manager assistant, and returns no score on the list", async () => {
    const h = await createRuntimeHttpHarness();
    harness = h;
    const owner = enterprise(await brokerUser(h, TENANT, "broker_owner_pro"));
    const manager = enterprise(await brokerUser(h, TENANT, "broker_manager"));
    for (const key of ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_summary_enabled"]) {
      await h.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "spec 069 custom role test" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    }
    const lead = await h.runtime.leads.assignments.create({ quoteRequestId: "q-069-cr", partnerTenantId: TENANT, assignmentReason: "routing", publicReference: "CR-1", countryCode: "CI", productKey: "auto" }, owner);
    const scoreResponse = await post(h, owner, `/broker/crm/leads/${lead.id}/ai/lead_score`);
    expect(scoreResponse.status).toBeLessThan(300);
    const interaction = await readJson<{ id: string }>(scoreResponse);
    await h.runtime.aiGateway.processPending();
    expect((await post(h, owner, `/broker/crm/ai/interactions/${interaction.id}/validation`, { decision: "approved" })).status).toBe(201);

    // Control: without a custom role the manager reads the scores and the sorted list.
    expect((await get(h, manager, "/broker/crm/ai/priority-scores")).status).toBe(200);
    expect((await post(h, manager, "/broker/crm/ai/performance-summary")).status).toBeLessThan(300);
    const before = await readJson<{ items: Array<{ priorityScore?: number }> }>(await get(h, manager, "/broker/crm/leads?sort=priority"));
    expect(before.items[0]?.priorityScore).toBeDefined();

    // A role without any broker_crm permission: every CRM AI route is refused, the list too (no score, no priority sort).
    const noCrm = await createRole(h, owner, "Leads sans CRM", ["broker_leads:read"]);
    await assign(h, owner, manager.actorId as string, noCrm.id);
    expect((await get(h, manager, "/broker/crm/ai/priority-scores")).status).toBe(403);
    expect((await post(h, manager, "/broker/crm/ai/performance-summary")).status).toBe(403);
    expect((await post(h, manager, "/broker/crm/ai/manager-assistant")).status).toBe(403);
    const refusedList = await get(h, manager, "/broker/crm/leads?sort=priority");
    expect(refusedList.status).toBe(403);
    expect(await refusedList.text()).not.toMatch(/priorityScore|priorityLevel/);

    // A role keeping broker_crm:read gets the read routes back (the restriction, not the plan, was the cause).
    const crmRead = await createRole(h, owner, "CRM lecture", ["broker_crm:read"]);
    await assign(h, owner, manager.actorId as string, crmRead.id);
    expect((await get(h, manager, "/broker/crm/ai/priority-scores")).status).toBe(200);
  });
});
