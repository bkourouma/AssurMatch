import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { partnerAgencySchema } from "../../../../packages/shared/contracts/enterprise.contracts";
import type { BrokerCrmLeadSummary } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { brokerUser } from "../broker-self-service/self-service-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 3 (spec 069 FR-004/FR-006): server-side sort, approved priority score and advisor tenant check through the runtime HTTP stack.
const TENANT = "00000000-0000-4000-8000-000000069b01";
const OTHER_TENANT = "00000000-0000-4000-8000-000000069b02";
const PRO_TENANT = "00000000-0000-4000-8000-000000069b03";
const STARTER_TENANT = "00000000-0000-4000-8000-000000069b04";
const json = { "content-type": "application/json" };
const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
const withPlan = (actor: ActorContext, partnerPlan: "starter" | "pro" | "enterprise"): ActorContext => ({ ...actor, partnerPlan });
type Page = { items: BrokerCrmLeadSummary[]; page: number; pageSize: number; total: number };

describe("spec 069 lot 3 CRM list sort and priority runtime HTTP", () => {
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
  const list = async (h: RuntimeHttpHarness, actor: ActorContext, query: string) => readJson<Page>(await get(h, actor, `/broker/crm/leads${query}`));
  const refs = (page: Page) => page.items.map((item) => item.publicReference);

  async function openScoring(h: RuntimeHttpHarness) {
    for (const key of ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled"]) {
      await h.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "spec 069 lot 3 sort test" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    }
  }

  async function approveScore(h: RuntimeHttpHarness, owner: ActorContext, leadId: string) {
    const interaction = aiInteractionSchema.parse(await readJson(await post(h, owner, `/broker/crm/leads/${leadId}/ai/lead_score`)));
    await h.runtime.aiGateway.processPending();
    expect((await post(h, owner, `/broker/crm/ai/interactions/${interaction.id}/validation`, { decision: "approved" })).status).toBe(201);
  }

  async function setup() {
    const h = await createRuntimeHttpHarness();
    harness = h;
    const owner = withPlan(await brokerUser(h, TENANT, "broker_owner_pro"), "enterprise");
    const agent = withPlan(await brokerUser(h, TENANT, "broker_agent"), "enterprise");
    const otherOwner = withPlan(await brokerUser(h, OTHER_TENANT, "broker_owner_pro"), "enterprise");
    const otherAgent = withPlan(await brokerUser(h, OTHER_TENANT, "broker_agent"), "enterprise");
    const proOwner = withPlan(await brokerUser(h, PRO_TENANT, "broker_owner_pro"), "pro");
    const starterOwner = withPlan(await brokerUser(h, STARTER_TENANT, "broker_owner_starter"), "starter");
    const agency = partnerAgencySchema.parse(await readJson(await post(h, owner, "/broker/enterprise/agencies", { name: "Agence Plateau", countryCode: "CI", reason: "Ouverture agence" })));
    await post(h, owner, `/broker/enterprise/agencies/${agency.id}/members`, { memberId: agent.actorId, reason: "Rattachement conseiller" });

    const create = async (tenant: string, reference: string, by: ActorContext, countryCode: string, advisor?: ActorContext) => {
      const lead = await h.runtime.leads.assignments.create({ quoteRequestId: `q-${reference}`, partnerTenantId: tenant, assignmentReason: "routing", publicReference: reference, countryCode, productKey: "auto" }, by);
      if (advisor) await h.runtime.leads.assignments.updateCrmMetadata(lead.id, { assignedAdvisorId: advisor.actorId as string }, by);
      return lead;
    };
    const leads = {
      a: await create(TENANT, "SRT-A", owner, "CI", agent),
      b: await create(TENANT, "SRT-B", owner, "CI"),
      c: await create(TENANT, "SRT-C", owner, "CI", agent),
      d: await create(TENANT, "SRT-D", owner, "SN"),
      foreign: await create(OTHER_TENANT, "SRT-FOREIGN", otherOwner, "CI", otherAgent),
      pro: await create(PRO_TENANT, "SRT-PRO", proOwner, "CI")
    };
    return { h, owner, agent, otherOwner, otherAgent, proOwner, starterOwner, agency, leads };
  }

  it("sorts the whole filtered set by approved score, with filters and pagination, and joins the score", async () => {
    const { h, owner, otherOwner, leads } = await setup();
    await openScoring(h);
    await approveScore(h, owner, leads.b.id);
    await approveScore(h, owner, leads.d.id);
    await approveScore(h, otherOwner, leads.foreign.id);

    const all = await list(h, owner, "?sort=priority&sortDirection=desc");
    expect(all.total).toBe(4);
    const scored = all.items.filter((item) => item.priorityScore !== undefined);
    expect(scored.map((item) => item.publicReference).sort()).toEqual(["SRT-B", "SRT-D"]);
    // Scored leads first, unscored last (ordered by assignedAt desc).
    expect(all.items.slice(0, 2).every((item) => item.priorityScore !== undefined)).toBe(true);
    expect(all.items.slice(2).every((item) => item.priorityScore === undefined && item.priorityLevel === undefined)).toBe(true);
    expect(scored[0]?.priorityScore).toBeGreaterThanOrEqual(scored[1]?.priorityScore ?? 0);
    expect(all.items[0]?.priorityLevel).toMatch(/^(low|medium|high)$/);

    // Ascending: unscored leads still last.
    const asc = await list(h, owner, "?sort=priority&sortDirection=asc");
    expect(asc.items.slice(0, 2).every((item) => item.priorityScore !== undefined)).toBe(true);
    expect(asc.items[0]?.priorityScore).toBeLessThanOrEqual(asc.items[1]?.priorityScore ?? 0);

    // Filter then sort then paginate: page 2 of size 1 over the CI leads (B scored, A and C not).
    const ci = await list(h, owner, "?sort=priority&countryCode=CI&pageSize=1&page=1");
    expect(ci.total).toBe(3);
    expect(refs(ci)).toEqual(["SRT-B"]);
    const ciPage2 = await list(h, owner, "?sort=priority&countryCode=CI&pageSize=1&page=2");
    expect(ciPage2.items).toHaveLength(1);
    expect(ciPage2.items[0]?.priorityScore).toBeUndefined();

    // An invalid sort key is a client error, never a 500.
    expect((await get(h, owner, "/broker/crm/leads?sort=prospectName")).status).toBe(400);
    // The CSV export never carries the score.
    const csv = await (await get(h, owner, "/broker/crm/leads/export.csv")).text();
    expect(csv.split("\n")[0]).not.toMatch(/priority|score/i);
    // Kanban still answers.
    expect((await get(h, owner, "/broker/crm/leads/kanban?sort=priority")).status).toBe(200);
  });

  it("isolates scores per tenant, per assigned scope and per agency", async () => {
    const { h, owner, agent, otherOwner, agency, leads } = await setup();
    await openScoring(h);
    await approveScore(h, owner, leads.b.id);
    await approveScore(h, owner, leads.a.id);
    await approveScore(h, otherOwner, leads.foreign.id);

    const own = await list(h, owner, "?sort=priority");
    expect(JSON.stringify(own)).not.toContain("SRT-FOREIGN");
    const other = await list(h, otherOwner, "?sort=priority");
    expect(refs(other)).toEqual(["SRT-FOREIGN"]);
    expect(other.items[0]?.priorityScore).toBeDefined();

    // An assigned-only advisor sees (and sorts) only its own leads: the score of SRT-B (not assigned to it) never leaks.
    const mine = await list(h, agent, "?sort=priority");
    expect(refs(mine).sort()).toEqual(["SRT-A", "SRT-C"]);
    expect(mine.items.find((item) => item.publicReference === "SRT-A")?.priorityScore).toBeDefined();
    expect(mine.items.find((item) => item.publicReference === "SRT-C")?.priorityScore).toBeUndefined();

    // Enterprise agency filter: only the leads of the agency's advisors, with their own scores.
    const inAgency = await list(h, owner, `?sort=priority&agencyId=${agency.id}`);
    expect(refs(inAgency).sort()).toEqual(["SRT-A", "SRT-C"]);
    expect(inAgency.items.find((item) => item.publicReference === "SRT-B")).toBeUndefined();
  });

  it("carries no score and keeps assignedAt order when scoring is closed, opted out or for Starter", async () => {
    const { h, owner, proOwner, starterOwner, leads } = await setup();
    // Flag closed (default).
    const closed = await list(h, owner, "?sort=priority");
    expect(closed.total).toBe(4);
    expect(closed.items.every((item) => item.priorityScore === undefined && item.priorityLevel === undefined)).toBe(true);
    expect(refs(closed)).toEqual(refs(await list(h, owner, "?sort=assignedAt&sortDirection=desc")));

    await openScoring(h);
    await approveScore(h, owner, leads.b.id);
    expect((await list(h, owner, "?sort=priority")).items[0]?.priorityScore).toBeDefined();
    // Pro without any approved score: no field.
    const pro = await list(h, proOwner, "?sort=priority");
    expect(pro.items.every((item) => item.priorityScore === undefined)).toBe(true);
    // Partner opt-out closes it again, without error.
    const optOut = await h.request("/broker/crm/ai/opt-out", { method: "PUT", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ optOut: true, reason: "Le cabinet refuse l'IA" }) });
    expect(optOut.status).toBe(200);
    const afterOptOut = await list(h, owner, "?sort=priority");
    expect(afterOptOut.items.every((item) => item.priorityScore === undefined)).toBe(true);
    // Starter has no CRM list at all.
    expect((await get(h, starterOwner, "/broker/crm/leads?sort=priority")).status).toBe(403);
  });

  it("refuses to assign a lead to an advisor of another cabinet or to an unknown id (4xx, never 500)", async () => {
    const { h, owner, agent, otherAgent, leads } = await setup();
    const assign = (advisorId: string, advisorPartnerTenantId: string) => post(h, owner, `/broker/crm/leads/${leads.b.id}/assign`, { advisorId, advisorPartnerTenantId });

    const own = await assign(agent.actorId as string, TENANT);
    expect(own.status).toBeLessThan(300);
    // Foreign advisor claiming either tenant: refused.
    for (const claimed of [TENANT, OTHER_TENANT]) {
      const refused = await assign(otherAgent.actorId as string, claimed);
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(refused.status).toBeLessThan(500);
    }
    const unknown = await assign("00000000-0000-4000-8000-00000000dead", TENANT);
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(unknown.status).toBeLessThan(500);
    const raw = await assign("not-a-user", TENANT);
    expect(raw.status).toBeGreaterThanOrEqual(400);
    expect(raw.status).toBeLessThan(500);
    // A suspended or deleted advisor of the same cabinet is refused as well (FR-006).
    for (const end of ["suspend", "softDelete"] as const) {
      const departing = withPlan(await brokerUser(h, TENANT, "broker_agent"), "enterprise");
      expect((await assign(departing.actorId as string, TENANT)).status).toBeLessThan(300);
      await h.runtime.leads.assignments.updateCrmMetadata(leads.b.id, { assignedAdvisorId: agent.actorId as string }, owner);
      await h.runtime.users.service[end](departing.actorId as string);
      const refused = await assign(departing.actorId as string, TENANT);
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(refused.status).toBeLessThan(500);
    }
    // The lead is still assigned to the legitimate advisor.
    const detail = await readJson<{ advisorId?: string }>(await get(h, owner, `/broker/crm/leads/${leads.b.id}`));
    expect(detail.advisorId).toBe(agent.actorId);
  });
});
