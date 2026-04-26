import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterExportPolicy } from "../../../src/modules/leads/broker-starter-export-policy";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";
import { BrokerStarterLeadsService } from "../../../src/modules/leads/broker-starter-leads.service";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";

const actor: ActorContext = { actorId: "broker-user", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("BrokerStarter dashboard", () => {
  it("aggregates counters only for the connected broker tenant", async () => {
    const audit = new AuditLogWriter();
    const assignments = new LeadAssignmentService(audit);
    const access = new BrokerStarterAccessPolicy(audit);
    const leads = new BrokerStarterLeadsService(assignments, access, new BrokerStarterHistoryService(), audit, new BrokerStarterExportPolicy(access, audit));

    const leadA = await assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    await assignments.updateStatus(leadA.id, "accepted", actor, "accepted");
    await assignments.create({ quoteRequestId: "q2", partnerTenantId: "broker-b", assignmentReason: "routing" }, { ...actor, partnerTenantId: "broker-b" });

    expect(await leads.dashboard(actor)).toEqual({ received: 1, seen: 0, accepted: 1, rejected: 0, disputed: 0 });
  });
});
