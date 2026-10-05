import { ConflictException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type {
  BrokerStarterCloseOutcome,
  BrokerStarterLeadActionRequest,
  BrokerStarterLeadCloseRequest,
  BrokerStarterLeadHistoryEvent,
  BrokerStarterLeadStatus,
  BrokerStarterReason
} from "../../../../packages/shared/contracts/quote.contracts";
import { brokerStarterLeadActionRequestSchema, brokerStarterLeadCloseRequestSchema } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterHistoryService } from "./broker-starter-history.service";
import { LeadAssignmentService, type LeadAssignmentRecord, type LeadAssignmentStatus } from "./lead-assignment.service";

const FINAL_STATUSES = new Set<LeadAssignmentStatus>(["closed"]);
/** Only a lead the broker took on can be closed with an outcome. */
const CLOSABLE_STATUSES = new Set<LeadAssignmentStatus>(["accepted", "received", "contacted"]);

export class BrokerStarterLeadActionsService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerStarterAccessPolicy,
    private readonly history: BrokerStarterHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly events?: { publish(eventType: "lead.status_changed" | "lead.accepted" | "lead.rejected", partnerTenantId: string, data: Record<string, unknown>): Promise<void> } | undefined
  ) {}

  /**
   * Spec 059 follow-up: closes an accepted lead with its outcome (won, lost, no follow-up). The
   * `lead.status_changed` event (status `closed`) drives the spec 054 visitor "closed" e-mail and
   * the spec 048 satisfaction survey trigger, exactly like a CRM `gagne` / `perdu`.
   */
  async close(id: string, input: BrokerStarterLeadCloseRequest, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = brokerStarterLeadCloseRequestSchema.parse(input);
    const assignment = await this.assignments.require(id);
    this.access.assertMutationAccess(actor, assignment);
    if (!CLOSABLE_STATUSES.has(assignment.status)) {
      const closed = FINAL_STATUSES.has(assignment.status);
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerStarterLeadClosed,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId },
        result: "refused",
        reason: closed ? "lead_closed" : "lead_not_accepted",
        context: { status: assignment.status, outcome: parsed.outcome }
      });
      throw closed
        ? new ConflictException({ code: ErrorCodes.LEAD_CLOSED, message: "Lead already closed" })
        : new ConflictException({ code: ErrorCodes.LEAD_NOT_ACCEPTED, message: "Lead must be accepted before it is closed" });
    }
    return this.transition(id, actor, "closed", QuoteAuditActions.brokerStarterLeadClosed, {
      outcome: parsed.outcome,
      ...(parsed.comment ? { comment: parsed.comment } : {})
    });
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
    input: { reason?: BrokerStarterReason; comment?: string; outcome?: BrokerStarterCloseOutcome }
  ): Promise<LeadAssignmentRecord> {
    const assignment = await this.assignments.require(id);
    this.access.assertMutationAccess(actor, assignment);
    if (FINAL_STATUSES.has(assignment.status)) {
      throw new Error("Final lead cannot be mutated");
    }
    const previousStatus = assignment.status;
    const updated = await this.assignments.updateStatus(id, status, actor, input.reason ?? (input.outcome ? `outcome:${input.outcome}` : "starter_action"));
    if (input.comment) updated.actionComment = input.comment.slice(0, 500);
    const eventType: BrokerStarterLeadHistoryEvent["eventType"] =
      status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : status === "closed" ? "closed" : "disputed";
    await this.history.append({
      leadAssignmentId: updated.id,
      partnerTenantId: updated.partnerTenantId,
      actor,
      eventType,
      previousStatus: this.toStarterStatus(previousStatus),
      nextStatus: this.toStarterStatus(status),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
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
      context: { previousStatus, nextStatus: status, ...(input.outcome ? { outcome: input.outcome } : {}) }
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
        status: "closed",
        ...(input.outcome ? { outcome: input.outcome } : {})
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
