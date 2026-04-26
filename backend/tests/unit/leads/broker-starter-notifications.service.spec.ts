import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";
import { BrokerStarterNotificationsService } from "../../../src/modules/leads/broker-starter-notifications.service";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";

const actor: ActorContext = { actorId: "owner", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("BrokerStarterNotificationsService", () => {
  it("lists and reads notifications only for the connected tenant", async () => {
    const audit = new AuditLogWriter();
    const assignments = new LeadAssignmentService(audit);
    const history = new BrokerStarterHistoryService();
    const service = new BrokerStarterNotificationsService(assignments, new BrokerStarterAccessPolicy(audit), history, audit);
    const lead = await assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);

    const notification = await service.createLeadAssigned(lead.id);

    expect(service.list(actor)).toHaveLength(1);
    expect(service.markRead(notification.id, actor).read).toBe(true);
    expect(() => service.markRead(notification.id, { ...actor, partnerTenantId: "broker-b" })).toThrow("Notification access denied");
  });
});
