import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";
import { BrokerStarterLeadActionsService } from "../../../src/modules/leads/broker-starter-lead-actions.service";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";

const actor: ActorContext = { actorId: "broker-user", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("BrokerStarterLeadActionsService", () => {
  it("accepts, rejects and disputes assigned leads with required reasons", async () => {
    const audit = new AuditLogWriter();
    const assignments = new LeadAssignmentService(audit);
    const history = new BrokerStarterHistoryService();
    const actions = new BrokerStarterLeadActionsService(assignments, new BrokerStarterAccessPolicy(audit), history, audit);

    const accepted = await assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    expect((await actions.accept(accepted.id, actor)).status).toBe("accepted");

    const rejected = await assignments.create({ quoteRequestId: "q2", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    expect(() => actions.reject(rejected.id, {}, actor)).toThrow("Reason is required");
    expect((await actions.reject(rejected.id, { reason: "duplicate" }, actor)).status).toBe("rejected");

    const disputed = await assignments.create({ quoteRequestId: "q3", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    expect((await actions.dispute(disputed.id, { reason: "wrong_scope", comment: "Produit different" }, actor)).status).toBe("disputed");

    expect(await history.forLead(disputed.id)).toHaveLength(1);
    expect(audit.search({ action: "broker_starter.lead_disputed", result: "success" })).toHaveLength(1);
  });

  it("closes an accepted lead with its outcome and publishes lead.status_changed (spec 059 follow-up)", async () => {
    const audit = new AuditLogWriter();
    const assignments = new LeadAssignmentService(audit);
    const history = new BrokerStarterHistoryService();
    const published: Array<{ eventType: string; partnerTenantId: string; data: Record<string, unknown> }> = [];
    const events = { publish: async (eventType: "lead.status_changed" | "lead.accepted" | "lead.rejected", partnerTenantId: string, data: Record<string, unknown>) => { published.push({ eventType, partnerTenantId, data }); } };
    const actions = new BrokerStarterLeadActionsService(assignments, new BrokerStarterAccessPolicy(audit), history, audit, events);

    const lead = await assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    // Not accepted yet: refused (409 LEAD_NOT_ACCEPTED) and audited.
    await expect(actions.close(lead.id, { outcome: "gagne" }, actor)).rejects.toMatchObject({ status: 409 });
    expect(audit.search({ action: "broker_starter.lead_closed", result: "refused" })).toHaveLength(1);

    await actions.accept(lead.id, actor);
    // An unknown outcome is a validation error.
    await expect(actions.close(lead.id, { outcome: "souscrit" as never }, actor)).rejects.toThrow();
    const closed = await actions.close(lead.id, { outcome: "sans_suite", comment: "Le visiteur ne repond plus" }, actor);
    expect(closed.status).toBe("closed");
    expect(closed.actionReason).toBe("outcome:sans_suite");

    const events1 = await history.forLead(lead.id);
    expect(events1.at(-1)).toMatchObject({ eventType: "closed", previousStatus: "accepted", nextStatus: "closed", outcome: "sans_suite" });
    expect(audit.search({ action: "broker_starter.lead_closed", result: "success" })[0]?.context).toMatchObject({ outcome: "sans_suite", nextStatus: "closed" });
    expect(published.find((event) => event.eventType === "lead.status_changed")?.data).toMatchObject({ leadAssignmentId: lead.id, status: "closed", previousStatus: "accepted", outcome: "sans_suite" });

    // Final: a second closure is refused (409 LEAD_CLOSED).
    await expect(actions.close(lead.id, { outcome: "gagne" }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to close another broker's lead", async () => {
    const audit = new AuditLogWriter();
    const assignments = new LeadAssignmentService(audit);
    const actions = new BrokerStarterLeadActionsService(assignments, new BrokerStarterAccessPolicy(audit), new BrokerStarterHistoryService(), audit);
    const other = await assignments.create({ quoteRequestId: "q9", partnerTenantId: "broker-b", assignmentReason: "routing" }, actor);
    await expect(actions.close(other.id, { outcome: "perdu" }, actor)).rejects.toThrow();
    expect((await assignments.require(other.id)).status).not.toBe("closed");
  });
});
