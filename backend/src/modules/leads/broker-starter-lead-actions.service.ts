import type { BrokerStarterLeadActionRequest, BrokerStarterLeadHistoryEvent, BrokerStarterLeadStatus, BrokerStarterReason } from "../../../../packages/shared/contracts/quote.contracts";
import { brokerStarterLeadActionRequestSchema } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterHistoryService } from "./broker-starter-history.service";
import { LeadAssignmentService, type LeadAssignmentRecord, type LeadAssignmentStatus } from "./lead-assignment.service";

const FINAL_STATUSES = new Set<LeadAssignmentStatus>(["closed"]);

export class BrokerStarterLeadActionsService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerStarterAccessPolicy,
    private readonly history: BrokerStarterHistoryService,
    private readonly audit: AuditLogWriter
  ) {}

  accept(id: string, actor: ActorContext): LeadAssignmentRecord {
    return this.transition(id, actor, "accepted", QuoteAuditActions.brokerStarterLeadAccepted, {});
  }

  reject(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext): LeadAssignmentRecord {
    const parsed = this.requireReason(input);
    return this.transition(id, actor, "rejected", QuoteAuditActions.brokerStarterLeadRejected, parsed);
  }

  dispute(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext): LeadAssignmentRecord {
    const parsed = this.requireReason(input);
    return this.transition(id, actor, "disputed", QuoteAuditActions.brokerStarterLeadDisputed, parsed);
  }

  private transition(
    id: string,
    actor: ActorContext,
    status: LeadAssignmentStatus,
    auditAction: string,
    input: { reason?: BrokerStarterReason; comment?: string }
  ): LeadAssignmentRecord {
    const assignment = this.assignments.require(id);
    this.access.assertMutationAccess(actor, assignment);
    if (FINAL_STATUSES.has(assignment.status)) {
      throw new Error("Final lead cannot be mutated");
    }
    const previousStatus = assignment.status;
    const updated = this.assignments.updateStatus(id, status, actor, input.reason ?? "starter_action");
    if (input.comment) updated.actionComment = input.comment.slice(0, 500);
    const eventType: BrokerStarterLeadHistoryEvent["eventType"] =
      status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "disputed";
    this.history.append({
      leadAssignmentId: updated.id,
      partnerTenantId: updated.partnerTenantId,
      actor,
      eventType,
      previousStatus: this.toStarterStatus(previousStatus),
      nextStatus: this.toStarterStatus(status),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.comment ? { comment: input.comment } : {})
    });
    this.audit.write({
      actor,
      action: auditAction,
      targetType: "LeadAssignment",
      targetId: updated.id,
      scope: { partnerTenantId: updated.partnerTenantId },
      result: "success",
      ...(input.reason ? { reason: input.reason } : {}),
      context: { previousStatus, nextStatus: status }
    });
    return updated;
  }

  private requireReason(input: BrokerStarterLeadActionRequest): { reason: BrokerStarterReason; comment?: string } {
    const parsed = brokerStarterLeadActionRequestSchema.parse(input);
    if (!parsed.reason) {
      throw new Error("Reason is required");
    }
    return {
      reason: parsed.reason,
      ...(parsed.comment ? { comment: parsed.comment } : {})
    };
  }

  private toStarterStatus(status: LeadAssignmentStatus): BrokerStarterLeadStatus {
    if (status === "received" || status === "contacted") return "assigned";
    return status;
  }
}
