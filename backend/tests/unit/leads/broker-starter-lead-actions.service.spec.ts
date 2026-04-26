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
});
