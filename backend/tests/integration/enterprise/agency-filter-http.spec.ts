import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { partnerAgencySchema } from "../../../../packages/shared/contracts/enterprise.contracts";
import type { BrokerCrmLeadSummary } from "../../../../packages/shared/contracts/quote.contracts";
import type { AdvisorPerformanceRow, BrokerDashboardResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { EnterpriseAuditActions } from "../../../src/modules/enterprise/enterprise-audit-actions";
import { brokerUser } from "../broker-self-service/self-service-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const TENANT = "00000000-0000-4000-8000-0000000064e1";
const OTHER_TENANT = "00000000-0000-4000-8000-0000000064e2";
const PRO_TENANT = "00000000-0000-4000-8000-0000000064e3";
const json = { "content-type": "application/json" };
const enterprise = (actor: ActorContext): ActorContext => ({ ...actor, partnerPlan: "enterprise" });

describe("spec 064 agency display filter", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(() => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
  });

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  async function post(h: RuntimeHttpHarness, actor: ActorContext, path: string, body: unknown): Promise<Response> {
    return h.request(path, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
  }

  async function setup() {
    const h = await createRuntimeHttpHarness();
    harness = h;
    await h.runtime.featureFlags.service.setFlag({ key: "broker_dashboard_enabled", scopeType: "global", value: true, reason: "spec 064 agency filter" }, { actorId: "test-admin", roles: ["super_admin"], mfaVerified: true });
    const owner = enterprise(await brokerUser(h, TENANT, "broker_owner_pro"));
    const a1 = enterprise(await brokerUser(h, TENANT, "broker_agent"));
    const a2 = enterprise(await brokerUser(h, TENANT, "broker_agent"));
    const a3 = enterprise(await brokerUser(h, TENANT, "broker_agent"));
    const otherOwner = enterprise(await brokerUser(h, OTHER_TENANT, "broker_owner_pro"));

    // Agency A: a1 and a2; agency B: a2 only (an advisor may belong to several agencies); a3 belongs to none.
    const agencyA = partnerAgencySchema.parse(await readJson(await post(h, owner, "/broker/enterprise/agencies", { name: "Agence Plateau", countryCode: "CI", reason: "Ouverture agence A" })));
    const agencyB = partnerAgencySchema.parse(await readJson(await post(h, owner, "/broker/enterprise/agencies", { name: "Agence Cocody", countryCode: "CI", reason: "Ouverture agence B" })));
    for (const [agency, member] of [[agencyA, a1], [agencyA, a2], [agencyB, a2]] as const) {
      await post(h, owner, `/broker/enterprise/agencies/${agency.id}/members`, { memberId: member.actorId, reason: "Rattachement conseiller" });
    }
    const otherAgency = partnerAgencySchema.parse(await readJson(await post(h, otherOwner, "/broker/enterprise/agencies", { name: "Agence ailleurs", countryCode: "CI", reason: "Ouverture agence autre" })));

    const create = async (reference: string, advisor?: ActorContext) => {
      const lead = await h.runtime.leads.assignments.create({ quoteRequestId: `q-${reference}`, partnerTenantId: TENANT, assignmentReason: "routing", publicReference: reference, countryCode: "CI", productKey: "auto" }, owner);
      if (advisor) await h.runtime.leads.assignments.updateCrmMetadata(lead.id, { assignedAdvisorId: advisor.actorId as string }, owner);
      return lead;
    };
    const leads = { l1: await create("AGY-1", a1), l2: await create("AGY-2", a2), l3: await create("AGY-3", a3), l4: await create("AGY-4") };
    return { h, owner, a1, a2, a3, otherOwner, agencyA, agencyB, otherAgency, leads };
  }

  const references = async (response: Response): Promise<string[]> => (await readJson<{ items: BrokerCrmLeadSummary[] }>(response)).items.map((item) => item.publicReference).sort();
  const list = (h: RuntimeHttpHarness, actor: ActorContext, query: string) => h.request(`/broker/crm/leads${query}`, { headers: actorHeaders(actor) });

  it("exposes memberIds on the agencies and filters the CRM list by agency, \"none\" and the combination with other filters", async () => {
    const { h, owner, agencyA, agencyB, a2 } = await setup();
    const agencies = await readJson<unknown[]>(await h.request("/broker/enterprise/agencies", { headers: actorHeaders(owner) }));
    const parsed = agencies.map((agency) => partnerAgencySchema.parse(agency));
    expect(parsed.find((agency) => agency.id === agencyB.id)?.memberIds).toEqual([a2.actorId]);
    expect(parsed.find((agency) => agency.id === agencyA.id)?.memberCount).toBe(2);

    expect(await references(await list(h, owner, ""))).toEqual(["AGY-1", "AGY-2", "AGY-3", "AGY-4"]);
    expect(await references(await list(h, owner, `?agencyId=${agencyA.id}`))).toEqual(["AGY-1", "AGY-2"]);
    expect(await references(await list(h, owner, `?agencyId=${agencyB.id}`))).toEqual(["AGY-2"]);
    expect(await references(await list(h, owner, "?agencyId=none"))).toEqual(["AGY-3", "AGY-4"]);
    // Narrowing only: other filters still apply on top.
    expect(await references(await list(h, owner, `?agencyId=${agencyA.id}&advisorId=${a2.actorId}`))).toEqual(["AGY-2"]);
    expect(await references(await list(h, owner, `?agencyId=${agencyB.id}&search=AGY-1`))).toEqual([]);

    const kanban = await readJson<Record<string, BrokerCrmLeadSummary[]>>(await h.request(`/broker/crm/leads/kanban?agencyId=${agencyB.id}`, { headers: actorHeaders(owner) }));
    expect(Object.values(kanban).flat().map((item) => item.publicReference)).toEqual(["AGY-2"]);
  });

  it("answers 404 for an unknown agency or one of another tenant, 400 for a malformed value, and audits the refusals", async () => {
    const { h, owner, otherAgency } = await setup();
    const unknown = await list(h, owner, "?agencyId=00000000-0000-4000-8000-000000000999");
    const foreign = await list(h, owner, `?agencyId=${otherAgency.id}`);
    expect(unknown.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect((await foreign.json() as { message: string }).message).toBe("Agency not found");
    expect(h.runtime.audit.writer.search({ action: EnterpriseAuditActions.accessRefused }).at(-1)?.reason).toBe("agency_not_found");
    expect((await list(h, owner, "?agencyId=not-a-uuid")).status).toBe(400);
    expect((await h.request("/broker/crm/dashboard?agencyId=00000000-0000-4000-8000-000000000999", { headers: actorHeaders(owner) })).status).toBe(404);
  });

  it("is ignored by a tenant that is not Enterprise (no error, full list)", async () => {
    const { h } = await setup();
    const proOwner: ActorContext = { ...(await brokerUser(h, PRO_TENANT, "broker_owner_pro")), partnerPlan: "pro" };
    await h.runtime.leads.assignments.create({ quoteRequestId: "q-pro-1", partnerTenantId: PRO_TENANT, assignmentReason: "routing", publicReference: "PRO-1" }, proOwner);
    await h.runtime.leads.assignments.create({ quoteRequestId: "q-pro-2", partnerTenantId: PRO_TENANT, assignmentReason: "routing", publicReference: "PRO-2" }, proOwner);
    expect(await references(await list(h, proOwner, "?agencyId=00000000-0000-4000-8000-000000000999"))).toEqual(["PRO-1", "PRO-2"]);
    expect(await references(await list(h, proOwner, "?agencyId=none"))).toEqual(["PRO-1", "PRO-2"]);
    expect((await h.request("/broker/dashboard?agencyId=none", { headers: actorHeaders(proOwner) })).status).toBe(200);
  });

  it("never widens what an assigned-only agent sees (RBAC unchanged)", async () => {
    const { h, a1, agencyA, agencyB } = await setup();
    expect(await references(await list(h, a1, ""))).toEqual(["AGY-1"]);
    expect(await references(await list(h, a1, `?agencyId=${agencyA.id}`))).toEqual(["AGY-1"]);
    expect(await references(await list(h, a1, `?agencyId=${agencyB.id}`))).toEqual([]);
    expect(await references(await list(h, a1, "?agencyId=none"))).toEqual([]);
  });

  it("makes the CSV export match the displayed list and audits it", async () => {
    const { h, owner, agencyB } = await setup();
    const csv = await h.request(`/broker/crm/leads/export.csv?agencyId=${agencyB.id}`, { headers: actorHeaders(owner) });
    expect(csv.status).toBe(200);
    const lines = (await csv.text()).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"AGY-2"');
    expect(h.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportRequested }).at(-1)?.context).toMatchObject({ filters: { agencyId: "[masked-id]" } });
    expect(h.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportCompleted }).at(-1)?.context).toMatchObject({ rowCount: 1 });
    const none = (await (await h.request("/broker/crm/leads/export.csv?agencyId=none", { headers: actorHeaders(owner) })).text()).split("\n");
    expect(none).toHaveLength(3);
  });

  it("makes the dashboards follow the filter (CRM dashboard, broker dashboard with comparison, advisors, CSV)", async () => {
    const { h, owner, a1, agencyA, agencyB, a2, a3 } = await setup();
    const crm = (query: string) => h.request(`/broker/crm/dashboard${query}`, { headers: actorHeaders(owner) }).then((response) => readJson<{ total: number }>(response));
    expect((await crm("")).total).toBe(4);
    expect((await crm(`?agencyId=${agencyA.id}`)).total).toBe(2);
    expect((await crm(`?agencyId=${agencyB.id}`)).total).toBe(1);
    expect((await crm("?agencyId=none")).total).toBe(2);

    const dashboard = (query: string) => h.request(`/broker/dashboard${query}`, { headers: actorHeaders(owner) }).then((response) => readJson<BrokerDashboardResponse>(response));
    expect((await dashboard("")).starter.received).toBe(4);
    const filtered = await dashboard(`?agencyId=${agencyB.id}&compare=previous`);
    expect(filtered.starter.received).toBe(1);
    expect(filtered.comparison?.previous.received).toBe(0);
    expect((await dashboard("?agencyId=none")).starter.received).toBe(2);

    const advisors = (query: string) => h.request(`/broker/dashboard/advisors${query}`, { headers: actorHeaders(owner) }).then((response) => readJson<AdvisorPerformanceRow[]>(response));
    expect((await advisors("")).map((row) => row.advisorId).sort()).toEqual([a1.actorId, a2.actorId, a3.actorId].sort());
    expect((await advisors(`?agencyId=${agencyB.id}`)).map((row) => row.advisorId)).toEqual([a2.actorId]);
    expect((await advisors("?agencyId=none")).map((row) => row.advisorId)).toEqual([a3.actorId]);

    const csv = await h.request(`/broker/dashboard/export.csv?agencyId=${agencyB.id}`, { headers: actorHeaders(owner) });
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("volumes,received,1");
    expect((await h.request("/broker/dashboard?agencyId=00000000-0000-4000-8000-000000000999", { headers: actorHeaders(owner) })).status).toBe(404);
  });

  it("does not apply the agency filter to the loss analysis", async () => {
    const { h, owner, agencyB, leads } = await setup();
    const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
    for (const key of ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_duplicate_detection_enabled"]) {
      await h.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "spec 064 agency filter" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    }
    for (const lead of [leads.l1, leads.l2, leads.l3]) await h.runtime.leads.assignments.updateCrmMetadata(lead.id, { crmStatus: "perdu" }, owner);

    // Even with the filter on the request, the analysis is computed on every lost lead of the tenant.
    const analysis = aiInteractionSchema.parse(await readJson(await h.request(`/broker/crm/ai/loss-analysis?agencyId=${agencyB.id}`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })));
    await h.runtime.aiGateway.processPending();
    const done = aiInteractionSchema.parse(await readJson(await h.request(`/broker/crm/ai/interactions/${analysis.id}`, { headers: actorHeaders(owner) })));
    expect(done.status).toBe("completed");
    expect(done.outputText).toContain("3 lead(s) perdus");
    expect((await h.runtime.leads.brokerCrmLeads.applyFilters(owner, { status: "perdu" })).map((lead) => lead.publicReference).sort()).toEqual(["AGY-1", "AGY-2", "AGY-3"]);
  });
});
