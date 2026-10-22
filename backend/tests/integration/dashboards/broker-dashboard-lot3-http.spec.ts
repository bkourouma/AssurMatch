import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { BrokerAgencyOverviewRow, BrokerDashboardResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { partnerAgencySchema } from "../../../../packages/shared/contracts/enterprise.contracts";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { brokerUser } from "../broker-self-service/self-service-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 3 (spec 069): multi-agency view, CRM KPI section and CSV, priority scores, performance summary
// and manager assistant, all through the runtime HTTP stack.
const TENANT = "00000000-0000-4000-8000-000000069a01";
const OTHER_TENANT = "00000000-0000-4000-8000-000000069a02";
const PRO_TENANT = "00000000-0000-4000-8000-000000069a03";
const STARTER_TENANT = "00000000-0000-4000-8000-000000069a04";
const json = { "content-type": "application/json" };
const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
const withPlan = (actor: ActorContext, partnerPlan: "starter" | "pro" | "enterprise"): ActorContext => ({ ...actor, partnerPlan });
const AI_FLAGS = ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_summary_enabled"];

describe("spec 069 lot 3 broker dashboard and CRM AI runtime HTTP", () => {
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

  const post = (h: RuntimeHttpHarness, actor: ActorContext, path: string, body: unknown = {}) =>
    h.request(path, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
  const get = (h: RuntimeHttpHarness, actor: ActorContext, path: string) => h.request(path, { headers: actorHeaders(actor) });

  async function openAi(h: RuntimeHttpHarness, keys: string[] = AI_FLAGS) {
    for (const key of keys) {
      await h.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "spec 069 lot 3 test" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    }
  }

  async function setup() {
    const h = await createRuntimeHttpHarness();
    harness = h;
    await h.runtime.featureFlags.service.setFlag({ key: "broker_dashboard_enabled", scopeType: "global", value: true, reason: "spec 069 lot 3" }, { actorId: "test-admin", roles: ["super_admin"], mfaVerified: true });
    const owner = withPlan(await brokerUser(h, TENANT, "broker_owner_pro"), "enterprise");
    const agent = withPlan(await brokerUser(h, TENANT, "broker_agent"), "enterprise");
    const otherOwner = withPlan(await brokerUser(h, OTHER_TENANT, "broker_owner_pro"), "enterprise");
    const proOwner = withPlan(await brokerUser(h, PRO_TENANT, "broker_owner_pro"), "pro");
    const starterOwner = withPlan(await brokerUser(h, STARTER_TENANT, "broker_owner_starter"), "starter");

    const agency = partnerAgencySchema.parse(await readJson(await post(h, owner, "/broker/enterprise/agencies", { name: "Agence Plateau", countryCode: "CI", reason: "Ouverture agence" })));
    await post(h, owner, `/broker/enterprise/agencies/${agency.id}/members`, { memberId: agent.actorId, reason: "Rattachement conseiller" });
    const otherAgency = partnerAgencySchema.parse(await readJson(await post(h, otherOwner, "/broker/enterprise/agencies", { name: "Agence ailleurs", countryCode: "CI", reason: "Ouverture agence autre" })));

    const create = async (tenant: string, reference: string, by: ActorContext, crmStatus?: "gagne" | "qualifie" | "perdu", advisor?: ActorContext) => {
      const lead = await h.runtime.leads.assignments.create({
        quoteRequestId: `q-${reference}`,
        partnerTenantId: tenant,
        assignmentReason: "routing",
        publicReference: reference,
        countryCode: "CI",
        productKey: "auto",
        contact: { displayName: "Ama Kone", email: "ama.kone@example.test", phone: "+2250102030405" }
      }, by);
      if (crmStatus || advisor) {
        await h.runtime.leads.assignments.updateCrmMetadata(lead.id, { ...(crmStatus ? { crmStatus } : {}), ...(advisor ? { assignedAdvisorId: advisor.actorId as string } : {}) }, by);
      }
      return lead;
    };
    const leads = {
      won: await create(TENANT, "L3-1", owner, "gagne", agent),
      qualified: await create(TENANT, "L3-2", owner, "qualifie", agent),
      loose: await create(TENANT, "L3-3", owner),
      foreign: await create(OTHER_TENANT, "L3-OTHER", otherOwner, "gagne"),
      pro: await create(PRO_TENANT, "L3-PRO", proOwner),
      starter: await create(STARTER_TENANT, "L3-STARTER", starterOwner)
    };
    return { h, owner, agent, otherOwner, proOwner, starterOwner, agency, otherAgency, leads };
  }

  it("serves the agencies overview to Enterprise only, per tenant, and audits it", async () => {
    const { h, owner, agent, proOwner, starterOwner, agency, otherAgency } = await setup();

    const response = await get(h, owner, "/broker/dashboard/agencies");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const rows = await readJson<BrokerAgencyOverviewRow[]>(response);
    expect(rows.map((row) => row.agencyName)).toEqual(["Agence Plateau", "Sans agence"]);
    expect(rows.find((row) => row.agencyId === agency.id)).toMatchObject({ advisors: 1, received: 2, won: 1, conversionRate: 0.5 });
    expect(rows.find((row) => row.agencyId === "none")).toMatchObject({ received: 1, won: 0 });
    // No cross-tenant leak: neither the other tenant's agency nor its lead appear anywhere.
    expect(rows.map((row) => row.agencyId)).not.toContain(otherAgency.id);
    expect(rows.reduce((sum, row) => sum + row.received, 0)).toBe(3);
    expect(JSON.stringify(rows)).not.toContain("Agence ailleurs");
    expect(h.runtime.audit.writer.search({ action: "dashboard.broker.agencies_read" }).length + h.runtime.audit.writer.search({ targetType: "BrokerDashboardAgencies" }).length).toBeGreaterThan(0);

    expect((await get(h, proOwner, "/broker/dashboard/agencies")).status).toBe(403);
    expect((await get(h, starterOwner, "/broker/dashboard/agencies")).status).toBe(403);
    // An assigned-only advisor never gets the tenant-wide rollup.
    expect((await get(h, agent, "/broker/dashboard/agencies")).status).toBe(403);
    // The other tenant sees only its own agency.
    const otherRows = await readJson<BrokerAgencyOverviewRow[]>(await get(h, withPlan(await brokerUser(h, OTHER_TENANT, "broker_owner_pro"), "enterprise"), "/broker/dashboard/agencies"));
    expect(otherRows.map((row) => row.agencyName)).toEqual(["Agence ailleurs", "Sans agence"]);
  });

  it("exposes the CRM KPI section to Pro and Enterprise, never to Starter, and exports it without prospect identity", async () => {
    const { h, owner, proOwner, starterOwner } = await setup();

    const dashboard = await readJson<BrokerDashboardResponse>(await get(h, owner, "/broker/dashboard"));
    expect(dashboard.crm?.kpis).toBeDefined();
    expect(dashboard.crm).toMatchObject({ conversionRate: 0.333 });
    expect(dashboard.crm?.kpis?.contactRate).toBeGreaterThan(0);
    expect(dashboard.crm?.kpis?.topSources.length).toBeGreaterThan(0);
    expect(dashboard.crm?.conversionByProduct[0]).toMatchObject({ productKey: "auto", received: 3, won: 1 });

    const pro = await readJson<BrokerDashboardResponse>(await get(h, proOwner, "/broker/dashboard"));
    expect(pro.plan).toBe("pro");
    expect(pro.crm?.kpis).toBeDefined();

    const starterResponse = await get(h, starterOwner, "/broker/dashboard");
    expect(starterResponse.status).toBe(200);
    const starter = await readJson<BrokerDashboardResponse>(starterResponse);
    expect(starter.plan).toBe("starter");
    expect(starter.crm).toBeUndefined();

    const csvResponse = await get(h, owner, "/broker/dashboard/export.csv");
    expect(csvResponse.status).toBe(200);
    const csv = await csvResponse.text();
    expect(csv).toContain("kpi,conversionRate,33%");
    expect(csv).toContain("kpi,contactRate,");
    expect(csv).toContain("kpi,qualificationRate,");
    expect(csv).toContain("source,");
    expect(csv).toContain("agence,Agence Plateau,");
    for (const forbidden of ["Ama", "Kone", "example.test", "2250102030405", "L3-1", "L3-OTHER"]) expect(csv).not.toContain(forbidden);
  });

  it("answers the priority scores only for approved scores, with closed flags, opt-out and Starter honoured", async () => {
    const { h, owner, otherOwner, starterOwner, leads } = await setup();

    // Flag closed (default): no score and no model call.
    const closed = await readJson<{ enabled: boolean; scores: Record<string, unknown> }>(await get(h, owner, "/broker/crm/ai/priority-scores"));
    expect(closed).toEqual({ enabled: false, scores: {} });

    await openAi(h);
    const open = await readJson<{ enabled: boolean; scores: Record<string, unknown> }>(await get(h, owner, "/broker/crm/ai/priority-scores"));
    expect(open).toEqual({ enabled: true, scores: {} });

    const score = aiInteractionSchema.parse(await readJson(await post(h, owner, `/broker/crm/leads/${leads.won.id}/ai/lead_score`)));
    await h.runtime.aiGateway.processPending();
    // Pending validation: still no score is exposed.
    expect((await readJson<{ scores: Record<string, unknown> }>(await get(h, owner, "/broker/crm/ai/priority-scores"))).scores).toEqual({});
    expect((await post(h, owner, `/broker/crm/ai/interactions/${score.id}/validation`, { decision: "approved" })).status).toBe(201);
    const approved = await readJson<{ enabled: boolean; scores: Record<string, { score: number; level: string }> }>(await get(h, owner, "/broker/crm/ai/priority-scores"));
    expect(Object.keys(approved.scores)).toEqual([leads.won.id]);
    expect(approved.scores[leads.won.id]?.score).toBeGreaterThan(0);
    expect(JSON.stringify(approved)).not.toContain("example.test");

    // Another tenant never sees them.
    expect(await readJson(await get(h, otherOwner, "/broker/crm/ai/priority-scores"))).toMatchObject({ enabled: true, scores: {} });
    // Starter has no CRM: refused or told that scoring is closed, never a score.
    const starter = await get(h, starterOwner, "/broker/crm/ai/priority-scores");
    if (starter.status === 200) expect(await readJson(starter)).toEqual({ enabled: false, scores: {} });
    else expect(starter.status).toBe(403);

    // Partner opt-out closes it again.
    const optOut = await h.request("/broker/crm/ai/opt-out", { method: "PUT", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ optOut: true, reason: "Le cabinet refuse l'IA" }) });
    expect(optOut.status).toBe(200);
    expect(await readJson(await get(h, owner, "/broker/crm/ai/priority-scores"))).toEqual({ enabled: false, scores: {} });
  });

  it("generates the performance summary only when the flag is open, pending human validation, per tenant", async () => {
    const { h, owner, agent, proOwner, starterOwner, otherOwner } = await setup();

    const refused = aiInteractionSchema.parse(await readJson(await post(h, owner, "/broker/crm/ai/performance-summary")));
    expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled" });
    expect(h.runtime.audit.writer.search({ action: AiAuditActions.refused }).at(-1)?.context).toMatchObject({ modelCall: false });
    expect(await h.runtime.aiGateway.processPending()).toBe(0);

    await openAi(h);
    const queued = aiInteractionSchema.parse(await readJson(await post(h, owner, "/broker/crm/ai/performance-summary", { windowDays: 30 })));
    expect(queued.status).toBe("queued");
    expect(await h.runtime.aiGateway.processPending()).toBe(1);
    const listed = await readJson<Array<{ id: string; status: string; humanValidationStatus: string; outputText: string | null }>>(await get(h, owner, "/broker/crm/ai/performance-summaries"));
    // The refused attempt is kept in the history next to the completed summary.
    expect(listed.map((entry) => entry.status).sort()).toEqual(["completed", "refused"]);
    const summary = listed.find((entry) => entry.id === queued.id);
    expect(summary).toMatchObject({ status: "completed", humanValidationStatus: "pending" });
    for (const forbidden of ["Ama", "Kone", "example.test", "2250102030405", "L3-"]) expect(summary?.outputText ?? "").not.toContain(forbidden);

    // Pro may generate; Starter and an assigned-only advisor may not; the other tenant sees nothing.
    expect(aiInteractionSchema.parse(await readJson(await post(h, proOwner, "/broker/crm/ai/performance-summary"))).status).toBe("queued");
    expect((await post(h, starterOwner, "/broker/crm/ai/performance-summary")).status).toBe(403);
    expect((await post(h, agent, "/broker/crm/ai/performance-summary")).status).toBe(403);
    expect(await readJson(await get(h, otherOwner, "/broker/crm/ai/performance-summaries"))).toEqual([]);
    expect((await get(h, starterOwner, "/broker/crm/ai/performance-summaries")).status).toBe(403);
  });

  it("restricts the manager assistant to Enterprise and keeps the advisor label map server side", async () => {
    const { h, owner, agent, proOwner, starterOwner, otherOwner } = await setup();

    const closed = await readJson<{ status: string }>(await post(h, owner, "/broker/crm/ai/manager-assistant"));
    expect(closed.status).toBe("refused");

    await openAi(h);
    const analysis = await readJson<{ id: string; status: string; advisorLabels: Record<string, string> }>(await post(h, owner, "/broker/crm/ai/manager-assistant"));
    expect(analysis.status).toBe("queued");
    expect(Object.values(analysis.advisorLabels)).toContain(agent.actorId);
    await h.runtime.aiGateway.processPending();
    const listed = await readJson<Array<{ id: string; status: string; outputText: string | null; humanValidationStatus: string }>>(await get(h, owner, "/broker/crm/ai/manager-analyses"));
    expect(listed.map((entry) => entry.status).sort()).toEqual(["completed", "refused"]);
    const done = listed.find((entry) => entry.id === analysis.id);
    expect(done).toMatchObject({ status: "completed", humanValidationStatus: "pending" });
    expect(done?.outputText ?? "").not.toContain(agent.actorId as string);

    // Pro: the gateway refuses (Enterprise only) and the list is denied.
    expect((await readJson<{ status: string }>(await post(h, proOwner, "/broker/crm/ai/manager-assistant"))).status).toBe("refused");
    expect((await get(h, proOwner, "/broker/crm/ai/manager-analyses")).status).toBe(403);
    expect((await post(h, starterOwner, "/broker/crm/ai/manager-assistant")).status).toBe(403);
    expect((await post(h, agent, "/broker/crm/ai/manager-assistant")).status).toBe(403);
    expect(await readJson(await get(h, otherOwner, "/broker/crm/ai/manager-analyses"))).toEqual([]);
  });
});
