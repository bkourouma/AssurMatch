import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";
import { BrokerStarterLeadActionsService } from "../../../src/modules/leads/broker-starter-lead-actions.service";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";

const actor: ActorContext = { actorId: "broker-user", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

function setup() {
  const audit = new AuditLogWriter();
  const assignments = new LeadAssignmentService(audit);
  const history = new BrokerStarterHistoryService();
  const published: string[] = [];
  const events = { publish: async (eventType: string) => { published.push(eventType); } };
  const actions = new BrokerStarterLeadActionsService(assignments, new BrokerStarterAccessPolicy(audit), history, audit, events as never);
  const create = (quoteRequestId: string) => assignments.create({ quoteRequestId, partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
  return { audit, assignments, history, actions, published, create };
}

describe("lead acceptance guards (A-02a, A-02c)", () => {
  it("refuses to accept a rejected lead with 409 LEAD_STATUS_NOT_ACCEPTABLE and leaves it rejected", async () => {
    const { actions, assignments, history, create } = setup();
    const lead = await create("q1");
    await actions.reject(lead.id, { reason: "duplicate" }, actor);
    const before = (await history.forLead(lead.id)).length;
    await expect(actions.accept(lead.id, actor)).rejects.toMatchObject({ status: 409, response: { code: "LEAD_STATUS_NOT_ACCEPTABLE" } });
    expect((await assignments.require(lead.id)).status).toBe("rejected");
    expect((await history.forLead(lead.id)).length).toBe(before);
  });

  it.each(["disputed", "closed"] as const)("refuses to accept a %s lead", async (status) => {
    const { actions, assignments, create } = setup();
    const lead = await create(`q-${status}`);
    await assignments.updateStatus(lead.id, status, actor, "setup");
    await expect(actions.accept(lead.id, actor)).rejects.toMatchObject({ status: 409, response: { code: "LEAD_STATUS_NOT_ACCEPTABLE" } });
  });

  it.each(["assigned", "broker_notified", "seen"] as const)("still accepts a lead in status %s", async (status) => {
    const { actions, assignments, create } = setup();
    const lead = await create(`q-${status}`);
    if (status !== "assigned") await assignments.updateStatus(lead.id, status, actor, "setup");
    expect((await actions.accept(lead.id, actor)).status).toBe("accepted");
  });

  it("is idempotent: a second accept is a 409 LEAD_ALREADY_ACCEPTED that adds no history, audit success or event", async () => {
    const { actions, audit, history, published, create } = setup();
    const lead = await create("q1");
    await actions.accept(lead.id, actor);
    const historyBefore = (await history.forLead(lead.id)).length;
    const acceptedAudits = audit.search({ action: "broker_starter.lead_accepted", result: "success" }).length;
    await expect(actions.accept(lead.id, actor)).rejects.toMatchObject({ status: 409, response: { code: "LEAD_ALREADY_ACCEPTED" } });
    expect((await history.forLead(lead.id)).length).toBe(historyBefore);
    expect(audit.search({ action: "broker_starter.lead_accepted", result: "success" })).toHaveLength(acceptedAudits);
    expect(published.filter((type) => type === "lead.accepted")).toHaveLength(1);
    expect(audit.search({ action: "broker_starter.lead_accepted", result: "refused" })).toHaveLength(1);
  });

  it("lets only one of two concurrent accepts through", async () => {
    const { actions, history, create } = setup();
    const lead = await create("q-race");
    const results = await Promise.allSettled([actions.accept(lead.id, actor), actions.accept(lead.id, actor)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ status: 409, response: { code: "LEAD_ALREADY_ACCEPTED" } });
    expect((await history.forLead(lead.id)).filter((event) => event.eventType === "accepted")).toHaveLength(1);
  });
});
