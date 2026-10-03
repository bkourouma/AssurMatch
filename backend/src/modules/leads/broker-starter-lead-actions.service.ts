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
    private readonly audit: AuditLogWriter,
    private readonly events?: { publish(eventType: "lead.status_changed" | "lead.accepted" | "lead.rejected", partnerTenantId: string, data: Record<string, unknown>): Promise<void> } | undefined
  ) {}

    close(id: string, actor: ActorContext): Promise<LeadAssignmentRecord> {
    return this.transition(id, actor, "closed", QuoteAuditActions.brokerStarterLeadClosed, {});
  }

accept(id: string, actor: ActorContext): Promise<LeadAssignmentRecord> {
    return this.transition(id, actor, "accepted", QuoteAuditActions.brokerStarterLeadAccepted, {});
  }

  reject(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = this.requireReason(input);
    return this.transition(id, actor, "rejected", QuoteAuditActions.brokerStarterLeadRejected, parsed);
  }

  dispute(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = this.requireReason(input);
    return this.transition(id, actor, "disputed", QuoteAuditActions.brokerStarterLeadDisputed, parsed);
  }

  private async transition(
    id: string,
    actor: ActorContext,
    status: LeadAssignmentStatus,
    auditAction: string,
    input: { reason?: BrokerStarterReason; comment?: string }
  ): Promise<LeadAssignmentRecord> {
    const assignment = await this.assignments.require(id);
    this.access.assertMutationAccess(actor, assignment);
    if (FINAL_STATUSES.has(assignment.status)) {
      throw new Error("Final lead cannot be mutated");
    }
    const previousStatus = assignment.status;
    const updated = await this.assignments.updateStatus(id, status, actor, input.reason ?? "starter_action");
    if (input.comment) updated.actionComment = input.comment.slice(0, 500);
    const eventType: BrokerStarterLeadHistoryEvent["eventType"] =
      status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "disputed";
    await this.history.append({
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
    // Spec 054 R6: acceptance and rejection change the public status, so they are published too
    // (internal events, never forwarded to partner webhooks).
    if (status === "accepted" || status === "rejected") {
      await this.events?.publish(status === "accepted" ? "lead.accepted" : "lead.rejected", updated.partnerTenantId, {
        leadAssignmentId: updated.id,
        publicReference: updated.publicReference,
        previousStatus: this.toStarterStatus(previousStatus),
        status
      }).catch(() => {});
    }
    if (status === "closed") {
      await this.events?.publish("lead.status_changed", updated.partnerTenantId, {
        leadAssignmentId: updated.id,
        publicReference: updated.publicReference,
        countryCode: updated.countryCode,
        productKey: updated.productKey,
        previousStatus: this.toStarterStatus(previousStatus),
        status: "closed"
      }).catch(() => {});
    }
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
