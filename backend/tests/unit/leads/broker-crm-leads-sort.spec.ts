import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { LeadsModule } from "../../../src/modules/leads/leads.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";

// Lot 3 (spec 069 FR-004/FR-006): server-side sort over the whole filtered set, approved priority score, assignment tenant check.
const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };
const otherOwner: ActorContext = { ...owner, actorId: "owner-b", partnerTenantId: "broker-b" };

async function setup() {
  const audit = new AuditLogWriter();
  const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
  const ids: Record<string, string> = {};
  // Oldest first so that `assignedAt desc` gives L5, L4, ... L1.
  for (const [index, reference] of ["L1", "L2", "L3", "L4", "L5"].entries()) {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 1 + index)));
    const lead = await module.assignments.create({ quoteRequestId: `q-${reference}`, partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: reference, countryCode: index < 4 ? "CI" : "SN", productKey: "auto" }, owner);
    ids[reference] = lead.id;
  }
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 10)));
  const foreign = await module.assignments.create({ quoteRequestId: "q-F", partnerTenantId: "broker-b", assignmentReason: "routing", publicReference: "FOREIGN", countryCode: "CI", productKey: "auto" }, otherOwner);
  ids.FOREIGN = foreign.id;
  await module.assignments.updateCrmMetadata(ids.L1 as string, { urgency: "urgent" }, owner);
  await module.assignments.updateCrmMetadata(ids.L2 as string, { urgency: "low" }, owner);
  await module.brokerCrmPipeline.changeStatus(ids.L3 as string, { status: "qualifie" }, owner);
  return { module, ids };
}

const refs = (page: { items: Array<{ publicReference: string }> }) => page.items.map((item) => item.publicReference);

describe("BrokerCrmLeadsService sort and priority score", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to assignedAt desc and sorts the whole filtered set before paginating", async () => {
    vi.useFakeTimers();
    const { module } = await setup();
    expect(refs(await module.brokerCrmLeads.list(owner, {}))).toEqual(["L5", "L4", "L3", "L2", "L1"]);
    expect(refs(await module.brokerCrmLeads.list(owner, { sort: "assignedAt", sortDirection: "asc" }))).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    // Urgency sort is global: the urgent lead of the oldest position comes first on page 1, the low one is last on page 2.
    const first = await module.brokerCrmLeads.list(owner, { sort: "urgency", page: 1, pageSize: 3 });
    const second = await module.brokerCrmLeads.list(owner, { sort: "urgency", page: 2, pageSize: 3 });
    expect(refs(first)[0]).toBe("L1");
    expect(refs(second).at(-1)).toBe("L2");
    expect(first.total).toBe(5);
    expect([...refs(first), ...refs(second)]).toEqual(["L1", "L5", "L4", "L3", "L2"]);
    // Pagination applies after the filter and the sort.
    const filtered = await module.brokerCrmLeads.list(owner, { countryCode: "CI", sort: "assignedAt", sortDirection: "asc", pageSize: 2, page: 2 });
    expect(refs(filtered)).toEqual(["L3", "L4"]);
    expect(filtered.total).toBe(4);
  });

  it("sorts by pipeline status", async () => {
    vi.useFakeTimers();
    const { module } = await setup();
    const asc = refs(await module.brokerCrmLeads.list(owner, { sort: "status", sortDirection: "asc" }));
    expect(asc[0]).toBe("L5");
    expect(asc.at(-1)).toBe("L3");
  });

  it("sorts by approved priority score with unscored leads always last, and joins the score only to listed leads", async () => {
    vi.useFakeTimers();
    const { module, ids } = await setup();
    const calls: ActorContext[] = [];
    module.brokerCrmLeads.setPriorityScoreSource(async (actor) => {
      calls.push(actor);
      return new Map<string, number>([[ids.L2 as string, 85], [ids.L4 as string, 20], [ids.L5 as string, 55], [ids.FOREIGN as string, 99]]);
    });
    const desc = await module.brokerCrmLeads.list(owner, { sort: "priority", sortDirection: "desc" });
    expect(refs(desc)).toEqual(["L2", "L5", "L4", "L3", "L1"]);
    expect(desc.items.map((item) => [item.priorityScore, item.priorityLevel])).toEqual([[85, "high"], [55, "medium"], [20, "low"], [undefined, undefined], [undefined, undefined]]);
    expect(refs(await module.brokerCrmLeads.list(owner, { sort: "priority", sortDirection: "asc" }))).toEqual(["L4", "L5", "L2", "L3", "L1"]);
    // Pagination happens after the priority sort; a filter keeps the order.
    expect(refs(await module.brokerCrmLeads.list(owner, { sort: "priority", pageSize: 2, page: 2 }))).toEqual(["L4", "L3"]);
    expect(refs(await module.brokerCrmLeads.list(owner, { sort: "priority", countryCode: "CI" }))).toEqual(["L2", "L4", "L3", "L1"]);
    // One read of the score source per request.
    expect(calls).toHaveLength(4);
    // Another cabinet's score never leaks into this perimeter, nor into its own list when the lead is not scored for it.
    expect(desc.items.some((item) => item.priorityScore === 99)).toBe(false);
    expect(JSON.stringify(desc)).not.toContain("FOREIGN");
  });

  it("returns no score field and falls back to assignedAt when scoring is closed or unavailable", async () => {
    vi.useFakeTimers();
    const { module } = await setup();
    // No source at all (Starter / flag closed upstream): sort=priority is accepted and equals assignedAt desc.
    const none = await module.brokerCrmLeads.list(owner, { sort: "priority" });
    expect(refs(none)).toEqual(["L5", "L4", "L3", "L2", "L1"]);
    expect(none.items.every((item) => !("priorityScore" in item) && !("priorityLevel" in item))).toBe(true);
    // Closed scoring answers an empty map; a failing source is ignored.
    module.brokerCrmLeads.setPriorityScoreSource(async () => new Map());
    expect(refs(await module.brokerCrmLeads.list(owner, { sort: "priority", sortDirection: "asc" }))).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    module.brokerCrmLeads.setPriorityScoreSource(async () => {
      throw new Error("boom");
    });
    expect(refs(await module.brokerCrmLeads.list(owner, { sort: "priority" }))).toEqual(["L5", "L4", "L3", "L2", "L1"]);
  });

  it("never exports the score and keeps the kanban working", async () => {
    vi.useFakeTimers();
    const { module, ids } = await setup();
    module.brokerCrmLeads.setPriorityScoreSource(async () => new Map<string, number>([[ids.L2 as string, 85]]));
    const csv = await module.brokerCrmLeads.exportCsv({ ...owner, roles: ["broker_owner_pro"] }, {});
    expect(csv.split("\n")[0]).not.toMatch(/priority|score/i);
    expect(csv).not.toContain("85");
    expect((await module.brokerCrmLeads.kanban(owner, {})).nouveau.length).toBeGreaterThan(0);
  });

  it("rejects an unknown sort key", async () => {
    vi.useFakeTimers();
    const { module } = await setup();
    await expect(module.brokerCrmLeads.list(owner, { sort: "prospectName" as never })).rejects.toThrow();
  });
});

describe("BrokerCrmActivityService assignment tenant check", () => {
  const setupAssign = async () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    const lead = await module.assignments.create({ quoteRequestId: "q-a", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "A1" }, owner);
    const directory: Record<string, string> = { "adv-a": "broker-a", "adv-b": "broker-b" };
    module.brokerCrmActivity.setAdvisorTenantResolver(async (advisorId) => directory[advisorId]);
    return { module, lead };
  };

  it("assigns an advisor of the same cabinet", async () => {
    const { module, lead } = await setupAssign();
    const updated = await module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "adv-a", advisorPartnerTenantId: "broker-a" }, owner);
    expect(updated.assignedAdvisorId).toBe("adv-a");
  });

  it("refuses an advisor of another cabinet even when the request claims the caller's tenant", async () => {
    const { module, lead } = await setupAssign();
    await expect(module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "adv-b", advisorPartnerTenantId: "broker-a" }, owner)).rejects.toThrow("Broker CRM access denied");
    await expect(module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "adv-b", advisorPartnerTenantId: "broker-b" }, owner)).rejects.toThrow("Broker CRM access denied");
  });

  it("refuses an unknown advisor id without crashing", async () => {
    const { module, lead } = await setupAssign();
    await expect(module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "ghost", advisorPartnerTenantId: "broker-a" }, owner)).rejects.toThrow("Broker CRM access denied");
    module.brokerCrmActivity.setAdvisorTenantResolver(async () => {
      throw new Error("directory down");
    });
    await expect(module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "adv-a", advisorPartnerTenantId: "broker-a" }, owner)).rejects.toThrow("Broker CRM access denied");
  });
});
