import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerLeadsController } from "../../../src/modules/leads/broker-leads.controller";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";
import { BrokerStarterLeadActionsService } from "../../../src/modules/leads/broker-starter-lead-actions.service";
import { LeadAssignmentService, type LeadAssignmentStatus } from "../../../src/modules/leads/lead-assignment.service";
import { LEAD_STATUS_TRANSITIONS, leadTransitionRefusal } from "../../../src/modules/leads/lead-status-transitions";

const actor: ActorContext = { actorId: "broker-user", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

function setup() {
  const audit = new AuditLogWriter();
  const assignments = new LeadAssignmentService(audit);
  const history = new BrokerStarterHistoryService();
  const published: string[] = [];
  const events = { publish: async (eventType: string) => { published.push(eventType); } };
  const actions = new BrokerStarterLeadActionsService(assignments, new BrokerStarterAccessPolicy(audit), history, audit, events as never);
  const crm = new BrokerLeadsController(assignments, audit);
  const create = (quoteRequestId: string) => assignments.create({ quoteRequestId, partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
  return { audit, assignments, history, actions, crm, published, create };
}

describe("lead status transition table", () => {
  it("never lists a status as its own successor and closed has no exit", () => {
    for (const [from, targets] of Object.entries(LEAD_STATUS_TRANSITIONS)) expect(targets).not.toContain(from);
    expect(LEAD_STATUS_TRANSITIONS.closed).toEqual([]);
  });

  it.each([
    ["rejected", "accepted", "LEAD_STATUS_NOT_ACCEPTABLE"],
    ["accepted", "accepted", "LEAD_ALREADY_ACCEPTED"],
    ["closed", "contacted", "LEAD_CLOSED"],
    ["rejected", "seen", "LEAD_STATUS_TRANSITION_NOT_ALLOWED"],
    ["disputed", "rejected", "LEAD_STATUS_TRANSITION_NOT_ALLOWED"]
  ] as Array<[LeadAssignmentStatus, LeadAssignmentStatus, string]>)("refuses %s -> %s with %s", (from, to, code) => {
    expect(leadTransitionRefusal(from, to)?.code).toBe(code);
  });
});

describe("generic CRM status PATCH (BrokerLeadsController.updateStatus)", () => {
  it("refuses rejected -> accepted with 409, keeps the lead rejected and audits the refusal", async () => {
    const { crm, assignments, audit, create } = setup();
    const lead = await create("q1");
    await crm.updateStatus(lead.id, { status: "rejected", reason: "motif de test valide" }, actor);
    const rejectedAt = (await assignments.require(lead.id)).rejectedAt;
    await expect(crm.updateStatus(lead.id, { status: "accepted", reason: "motif de test valide" }, actor)).rejects.toMatchObject({ status: 409, response: { code: "LEAD_STATUS_NOT_ACCEPTABLE" } });
    const after = await assignments.require(lead.id);
    expect(after.status).toBe("rejected");
    expect(after.rejectedAt).toBe(rejectedAt);
    expect(audit.search({ action: "broker_lead.status_updated", result: "refused" })).toHaveLength(1);
  });

  it.each(["rejected", "disputed", "closed"] as const)("never moves a %s lead back to an active status", async (status) => {
    const { crm, assignments, create } = setup();
    const lead = await create(`q-${status}`);
    await assignments.updateStatus(lead.id, status, actor, "setup");
    for (const next of ["seen", "accepted", "received", "contacted"] as const) {
      await expect(crm.updateStatus(lead.id, { status: next, reason: "motif de test valide" }, actor)).rejects.toMatchObject({ status: 409 });
    }
    expect((await assignments.require(lead.id)).status).toBe(status);
  });

  it("refuses a repeated accepted with LEAD_ALREADY_ACCEPTED", async () => {
    const { crm, create } = setup();
    const lead = await create("q1");
    await crm.updateStatus(lead.id, { status: "accepted", reason: "motif de test valide" }, actor);
    await expect(crm.updateStatus(lead.id, { status: "accepted", reason: "motif de test valide" }, actor)).rejects.toMatchObject({ status: 409, response: { code: "LEAD_ALREADY_ACCEPTED" } });
  });

  it("keeps the legitimate CRM moves working", async () => {
    const { crm, assignments, create } = setup();
    const lead = await create("q1");
    for (const status of ["seen", "accepted", "contacted", "closed"] as const) {
      expect((await crm.updateStatus(lead.id, { status, reason: "motif de test valide" }, actor)).status).toBe(status);
    }
    const other = await create("q2");
    expect((await crm.updateStatus(other.id, { status: "rejected", reason: "motif de test valide" }, actor)).status).toBe("rejected");
    expect((await crm.updateStatus(other.id, { status: "disputed", reason: "motif de test valide" }, actor)).status).toBe("disputed");
    expect((await assignments.require(other.id)).status).toBe("disputed");
  });
});

describe("Starter reject and dispute guards", () => {
  it("rejecting an already rejected lead is a 409 without history, success audit or event", async () => {
    const { actions, audit, history, published, create } = setup();
    const lead = await create("q1");
    await actions.reject(lead.id, { reason: "duplicate" }, actor);
    const historyBefore = (await history.forLead(lead.id)).length;
    await expect(actions.reject(lead.id, { reason: "duplicate" }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await history.forLead(lead.id)).length).toBe(historyBefore);
    expect(audit.search({ action: "broker_starter.lead_rejected", result: "success" })).toHaveLength(1);
    expect(audit.search({ action: "broker_starter.lead_rejected", result: "refused" })).toHaveLength(1);
    expect(published.filter((type) => type === "lead.rejected")).toHaveLength(1);
  });

  it("rejecting an accepted lead is a 409 and leaves it accepted", async () => {
    const { actions, assignments, published, create } = setup();
    const lead = await create("q1");
    await actions.accept(lead.id, actor);
    await expect(actions.reject(lead.id, { reason: "lead_quality" }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await assignments.require(lead.id)).status).toBe("accepted");
    expect(published).not.toContain("lead.rejected");
  });

  it("lets only one of two concurrent rejects through", async () => {
    const { actions, create } = setup();
    const lead = await create("q-race");
    const results = await Promise.allSettled([actions.reject(lead.id, { reason: "duplicate" }, actor), actions.reject(lead.id, { reason: "duplicate" }, actor)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("refuses to dispute a closed lead with 409 LEAD_CLOSED and writes nothing", async () => {
    const { actions, assignments, audit, history, create } = setup();
    const lead = await create("q1");
    await assignments.updateStatus(lead.id, "closed", actor, "setup");
    await expect(actions.dispute(lead.id, { reason: "lead_quality" }, actor)).rejects.toMatchObject({ status: 409, response: { code: "LEAD_CLOSED" } });
    expect((await history.forLead(lead.id)).length).toBe(0);
    expect(audit.search({ action: "broker_starter.lead_disputed", result: "success" })).toHaveLength(0);
  });

  it("refuses a second dispute (DISPUTE_ALREADY_EXISTS) and still disputes accepted or rejected leads", async () => {
    const { actions, assignments, create } = setup();
    const lead = await create("q1");
    await actions.accept(lead.id, actor);
    expect((await actions.dispute(lead.id, { reason: "lead_quality" }, actor)).status).toBe("disputed");
    await expect(actions.dispute(lead.id, { reason: "lead_quality" }, actor)).rejects.toMatchObject({ status: 409, response: { code: "DISPUTE_ALREADY_EXISTS" } });
    const rejected = await create("q2");
    await actions.reject(rejected.id, { reason: "duplicate" }, actor);
    expect((await actions.dispute(rejected.id, { reason: "wrong_scope" }, actor)).status).toBe("disputed");
    expect((await assignments.require(rejected.id)).status).toBe("disputed");
  });
});
