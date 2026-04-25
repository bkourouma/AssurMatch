import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "./lead-assignment.service";

export class LeadAccessPolicy {
  constructor(private readonly audit: AuditLogWriter) {}

  assertBrokerCanAccess(actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (actor.partnerTenantId !== assignment.partnerTenantId) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerLeadCrossTenantRefused,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId },
        result: "refused",
        reason: "cross_tenant_access",
        context: {}
      });
      throw new Error("Lead access denied");
    }
  }
}
