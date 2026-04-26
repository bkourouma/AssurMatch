import { brokerCrmStatusUpdateSchema, type BrokerCrmStatusUpdate } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { BrokerCrmHistoryService } from "./broker-crm-history.service";
import { LeadAssignmentService, type BrokerCrmPipelineStatus, type LeadAssignmentRecord } from "./lead-assignment.service";

export class BrokerCrmPipelineService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerCrmAccessPolicy,
    private readonly history: BrokerCrmHistoryService,
    private readonly audit: AuditLogWriter
  ) {}

  async changeStatus(id: string, input: BrokerCrmStatusUpdate, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = brokerCrmStatusUpdateSchema.parse(input);
    const assignment = await this.assignments.require(id);
    this.access.assertMutation(actor, assignment);
    const previousStatus = assignment.crmStatus ?? "nouveau";
    const updated = await this.assignments.updateCrmMetadata(id, { crmStatus: parsed.status as BrokerCrmPipelineStatus }, actor);
    await this.history.append({
      leadAssignmentId: id,
      partnerTenantId: assignment.partnerTenantId,
      actor,
      eventType: "status_changed",
      previousStatus,
      nextStatus: parsed.status,
      ...(parsed.reason ? { reason: parsed.reason } : {})
    });
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmStatusChanged,
      targetType: "LeadAssignment",
      targetId: id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      ...(parsed.reason ? { reason: parsed.reason } : {}),
      context: { previousStatus, nextStatus: parsed.status }
    });
    return updated;
  }
}
