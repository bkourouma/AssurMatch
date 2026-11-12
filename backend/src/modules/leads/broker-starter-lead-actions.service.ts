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
import { LeadDisputesService } from "./lead-disputes.service";
import { REJECTABLE_STATUSES, leadTransitionRefusal, type LeadTransitionRefusal } from "./lead-status-transitions";

const FINAL_STATUSES = new Set<LeadAssignmentStatus>(["closed"]);
/** Only a lead the broker took on can be closed with an outcome. */
const CLOSABLE_STATUSES = new Set<LeadAssignmentStatus>(["accepted", "received", "contacted"]);
/** Only a lead still waiting for the broker's decision can be accepted (A-02a: a rejected lead no longer can). */
const ACCEPTABLE_STATUSES = new Set<LeadAssignmentStatus>(["assigned", "broker_notified", "seen"]);

export class BrokerStarterLeadActionsService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerStarterAccessPolicy,
    private readonly history: BrokerStarterHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly events?: { publish(eventType: "lead.status_changed" | "lead.accepted" | "lead.rejected", partnerTenantId: string, data: Record<string, unknown>): Promise<void> } | undefined,
    /** Spec 063: the shared dispute service (window, uniqueness, record); a private one when not injected. */
    private readonly disputes: LeadDisputesService = new LeadDisputesService({ audit, assignments })
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

  /**
   * Accepting is guarded on the source status and serialised per lead (check then update inside the
   * same critical section), so two successive or concurrent calls can never both succeed: the second
   * one is refused with 409 and writes no history, audit entry or event.
   */
  accept(id: string, actor: ActorContext): Promise<LeadAssignmentRecord> {
    return this.serialised(id, async () => {
      const assignment = await this.assignments.require(id);
      this.access.assertMutationAccess(actor, assignment);
      if (!ACCEPTABLE_STATUSES.has(assignment.status)) {
        const already = assignment.status === "accepted";
        this.audit.write({
          actor,
          action: QuoteAuditActions.brokerStarterLeadAccepted,
          targetType: "LeadAssignment",
          targetId: assignment.id,
          scope: { partnerTenantId: assignment.partnerTenantId },
          result: "refused",
          reason: already ? "lead_already_accepted" : "lead_status_not_acceptable",
          context: { status: assignment.status }
        });
        throw already
          ? new ConflictException({ code: ErrorCodes.LEAD_ALREADY_ACCEPTED, message: "Lead already accepted" })
          : new ConflictException({ code: ErrorCodes.LEAD_STATUS_NOT_ACCEPTABLE, message: "Lead cannot be accepted from its current status" });
      }
      return this.transition(id, actor, "accepted", QuoteAuditActions.brokerStarterLeadAccepted, {});
    });
  }

  private readonly leadLocks = new Map<string, Promise<unknown>>();

  private serialised<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.leadLocks.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    this.leadLocks.set(id, tail);
    void tail.then(() => {
      if (this.leadLocks.get(id) === tail) this.leadLocks.delete(id);
    });
    return run;
  }

  /**
   * Rejecting is only possible while the lead still waits for the broker's decision: a rejected,
   * accepted, disputed or closed lead answers 409 and writes no history, event or success audit.
   */
  reject(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = this.requireReason(input);
    return this.serialised(id, async () => {
      const assignment = await this.assignments.require(id);
      this.access.assertMutationAccess(actor, assignment);
      if (!REJECTABLE_STATUSES.has(assignment.status)) {
        const refusal = leadTransitionRefusal(assignment.status, "rejected") as LeadTransitionRefusal;
        const already = assignment.status === "rejected";
        this.audit.write({
          actor,
          action: QuoteAuditActions.brokerStarterLeadRejected,
          targetType: "LeadAssignment",
          targetId: assignment.id,
          scope: { partnerTenantId: assignment.partnerTenantId },
          result: "refused",
          reason: already ? "lead_already_rejected" : refusal.reason,
          context: { status: assignment.status }
        });
        throw new ConflictException({ code: refusal.code, message: already ? "Lead already rejected" : refusal.message });
      }
      return this.transition(id, actor, "rejected", QuoteAuditActions.brokerStarterLeadRejected, parsed);
    });
  }

  /**
   * Spec 063 FR-B01/FR-B02: the Starter dispute creates the shared dispute record (30-day window,
   * one dispute per lead) and moves the assignment to `disputed`; the finance admin decides later.
   */
  async dispute(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = this.requireReason(input);
    const assignment = await this.assignments.require(id);
    this.access.assertMutationAccess(actor, assignment);
    // A closed lead is final; an already disputed one is refused by `disputes.open` (DISPUTE_ALREADY_EXISTS).
    // Every other status can be contested within the unchanged 30-day window (accepted, rejected, ...).
    if (assignment.status !== "disputed") {
      const refusal = leadTransitionRefusal(assignment.status, "disputed");
      if (refusal) {
        this.audit.write({
          actor,
          action: QuoteAuditActions.brokerStarterLeadDisputed,
          targetType: "LeadAssignment",
          targetId: assignment.id,
          scope: { partnerTenantId: assignment.partnerTenantId },
          result: "refused",
          reason: refusal.reason,
          context: { status: assignment.status }
        });
        throw new ConflictException({ code: refusal.code, message: refusal.message });
      }
    }
    const previousStatus = assignment.status;
    await this.disputes.open({ assignment, source: "starter", reason: parsed.reason, ...(parsed.comment ? { comment: parsed.comment } : {}), actor });
    const updated = await this.assignments.require(id);
    if (parsed.comment) updated.actionComment = parsed.comment.slice(0, 500);
    await this.history.append({
      leadAssignmentId: updated.id,
      partnerTenantId: updated.partnerTenantId,
      actor,
      eventType: "disputed",
      previousStatus: this.toStarterStatus(previousStatus),
      nextStatus: this.toStarterStatus("disputed"),
      reason: parsed.reason,
      ...(parsed.comment ? { comment: parsed.comment } : {})
    });
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterLeadDisputed,
      targetType: "LeadAssignment",
      targetId: updated.id,
      scope: { partnerTenantId: updated.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: { previousStatus, nextStatus: "disputed" }
    });
    return updated;
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
