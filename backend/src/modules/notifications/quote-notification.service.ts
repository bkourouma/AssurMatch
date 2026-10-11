import type { VisitorNotificationType } from "../../../../packages/shared/contracts/ops.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { QueueJobRecord, QueuePort } from "../common/queues/queues.module";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import type { NotificationRecord, NotificationsService } from "./notifications.module";

/** Every visitor e-mail type the worker renders: the spec 054 steps plus the two spec 044 legacy ones. */
export type VisitorEmailNotificationType = VisitorNotificationType | "visitor_quote_confirmation" | "visitor_quote_non_routable";

/**
 * Spec 054 R3: one visitor step. `assignmentId` and the partner ids are the only event data kept on
 * the row (`eventPayload`); the partner name, the language and the link are resolved at render time.
 */
export interface VisitorNotificationEvent {
  type: VisitorEmailNotificationType;
  assignmentId?: string | undefined;
  partnerTenantId?: string | undefined;
  previousPartnerTenantId?: string | undefined;
  /** Discriminates two occurrences of the same step (a new partner, a new resend). */
  seq?: string | undefined;
}

type QueuedNotification = { notification: NotificationRecord; job: QueueJobRecord };

/** Spec 054 R3: `{type}:{quoteRequestId}:{assignmentId|-}:{seq}`. */
export function visitorNotificationDedupeKey(quoteRequestId: string, event: VisitorNotificationEvent): string {
  return `${event.type}:${quoteRequestId}:${event.assignmentId ?? "-"}:${event.seq ?? event.partnerTenantId ?? "0"}`;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export class QuoteNotificationService {
  constructor(
    private readonly notifications: NotificationRecord[] | NotificationsService,
    private readonly queue: QueuePort,
    private readonly audit: AuditLogWriter,
    private readonly inApp?: { publishInApp(input: { scopeId: string; template: string; title: string; body: string; targetType?: string; targetId?: string }): Promise<unknown> }
  ) {}

  /**
   * First visitor e-mail of a request: "received", "in review" (manual review, never announced as
   * transmitted) or "not transmitted". The transmission itself is a separate step per assignment.
   */
  async queueVisitor(quote: QuoteRequestRecord, actor: ActorContext): Promise<QueuedNotification | undefined> {
    const type: VisitorEmailNotificationType = quote.status === "non_routable"
      ? "visitor_quote_non_routable"
      : quote.status === "manual_review" || quote.routingStatus === "manual_review_required" || quote.routingStatus === "pending_manual_assignment"
        ? "visitor_quote_in_review"
        : "visitor_quote_received";
    return this.queueVisitorEvent(quote, { type }, actor);
  }

  /** Spec 054 FR-011: queues one visitor e-mail per event, request and partner; a repeat is a no-op. */
  async queueVisitorEvent(quote: Pick<QuoteRequestRecord, "id" | "publicReference">, event: VisitorNotificationEvent, actor: ActorContext): Promise<QueuedNotification | undefined> {
    const dedupeKey = visitorNotificationDedupeKey(quote.id, event);
    if (await this.exists(dedupeKey)) return undefined;
    const eventPayload: Record<string, string> = {
      ...(event.assignmentId ? { assignmentId: event.assignmentId } : {}),
      ...(event.partnerTenantId ? { partnerTenantId: event.partnerTenantId } : {}),
      ...(event.previousPartnerTenantId ? { previousPartnerTenantId: event.previousPartnerTenantId } : {})
    };
    const now = new Date();
    const job = this.queue.add("visitor-quote-notifications", "visitor_quote_notification", quote.id, actor.correlationId);
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type: event.type,
      recipientScope: `visitor:${quote.publicReference}`,
      whatsAppStatus: "queued",
      emailStatus: "queued",
      payloadReference: quote.id,
      dedupeKey,
      ...(Object.keys(eventPayload).length > 0 ? { eventPayload } : {}),
      queueJobRecordId: job.id,
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    // A concurrent writer that stored the same key first leaves this job without a row: the worker
    // drains rows, not jobs, so nothing is sent twice.
    if (!(await this.persist(notification))) return undefined;
    this.audit.write({
      actor,
      action: QuoteAuditActions.notificationVisitorQueued,
      targetType: "Notification",
      targetId: notification.id,
      scope: { quoteRequestId: quote.id, ...(event.partnerTenantId ? { partnerTenantId: event.partnerTenantId } : {}) },
      result: "success",
      context: { type: notification.type }
    });
    return { notification, job };
  }

  async queueBroker(quote: QuoteRequestRecord, assignment: LeadAssignmentRecord, actor: ActorContext, options: { allowRepeat?: boolean; reassigned?: boolean } = {}): Promise<QueuedNotification | undefined> {
    // Spec 061: a lead moved by a reassignment is announced as such to the receiving cabinet.
    const type = options.reassigned ? "broker_lead_reassigned" : "broker_lead_assigned";
    // A reassigned lead keeps its assignment id but must reach the new partner.
    const dedupeKey = `${type}:${quote.id}:${assignment.id}:${assignment.partnerTenantId}${options.allowRepeat ? `:${crypto.randomUUID()}` : ""}`;
    if (await this.exists(dedupeKey)) return undefined;
    const now = new Date();
    const job = this.queue.add("broker-lead-notifications", "broker_lead_notification", assignment.id, actor.correlationId);
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type,
      recipientScope: `partner:${assignment.partnerTenantId}`,
      whatsAppStatus: "queued",
      emailStatus: "queued",
      payloadReference: quote.id,
      dedupeKey,
      queueJobRecordId: job.id,
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    if (!(await this.persist(notification))) return undefined;
    // In-app is part of the operational baseline: the assigned tenant always sees the lead in its inbox.
    await this.inApp?.publishInApp({
      scopeId: assignment.partnerTenantId,
      template: type,
      title: options.reassigned ? "Lead réaffecté à votre cabinet" : "Nouveau lead assigné",
      body: `Un lead ${assignment.productKey ?? "assurance"} (${assignment.countryCode ?? "-"}) vous a été ${options.reassigned ? "réaffecté" : "assigné"}. Notification opérationnelle, aucun engagement contractuel.`,
      targetType: "LeadAssignment",
      targetId: assignment.id
    });
    this.audit.write({
      actor,
      action: QuoteAuditActions.notificationBrokerQueued,
      targetType: "Notification",
      targetId: notification.id,
      scope: { quoteRequestId: quote.id, partnerTenantId: assignment.partnerTenantId },
      result: "success",
      context: { type: notification.type }
    });
    return { notification, job };
  }

  /**
   * Spec 055 FR-008: the visitor answered a proposal. One row per response (e-mail pointer) and one
   * in-app inbox entry for the broker that sent the proposal; the answer itself stays in the portal.
   */
  async queueBrokerVisitorResponse(
    quote: Pick<QuoteRequestRecord, "id" | "publicReference">,
    event: { assignmentId: string; partnerTenantId: string; proposalId: string; responseId: string; responseType: string },
    actor: ActorContext
  ): Promise<QueuedNotification | undefined> {
    const dedupeKey = `broker_visitor_response:${quote.id}:${event.assignmentId}:${event.responseId}`;
    if (await this.exists(dedupeKey)) return undefined;
    const now = new Date();
    const job = this.queue.add("broker-lead-notifications", "broker_lead_notification", event.assignmentId, actor.correlationId);
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type: "broker_visitor_response",
      recipientScope: `partner:${event.partnerTenantId}`,
      whatsAppStatus: "queued",
      emailStatus: "queued",
      payloadReference: quote.id,
      dedupeKey,
      eventPayload: { assignmentId: event.assignmentId, partnerTenantId: event.partnerTenantId, proposalId: event.proposalId, responseType: event.responseType },
      queueJobRecordId: job.id,
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    if (!(await this.persist(notification))) return undefined;
    await this.inApp?.publishInApp({
      scopeId: event.partnerTenantId,
      template: "broker_visitor_response",
      title: "Réponse du visiteur à votre proposition",
      body: `Le visiteur a répondu à votre proposition pour la demande ${quote.publicReference}. Le statut du lead n'est pas modifié automatiquement.`,
      targetType: "LeadAssignment",
      targetId: event.assignmentId
    }).catch(() => undefined);
    this.audit.write({
      actor,
      action: QuoteAuditActions.notificationBrokerQueued,
      targetType: "Notification",
      targetId: notification.id,
      scope: { quoteRequestId: quote.id, partnerTenantId: event.partnerTenantId },
      result: "success",
      context: { type: notification.type, responseType: event.responseType }
    });
    return { notification, job };
  }

  private async exists(dedupeKey: string): Promise<boolean> {
    if (Array.isArray(this.notifications)) return this.notifications.some((notification) => notification.dedupeKey === dedupeKey);
    // Spec 059 follow-up (M-03): no read-before-write. The unique `dedupeKey` index decides in
    // `persist` (a repeat is a unique violation, answered as "already queued"); the memory
    // repository enforces the same rule. Saves one query per queued e-mail on the submission path.
    return false;
  }

  /** `false` when a concurrent writer stored the same idempotency key first (unique index). */
  private async persist(notification: NotificationRecord): Promise<boolean> {
    if (Array.isArray(this.notifications)) {
      this.notifications.push(notification);
      return true;
    }
    try {
      await this.notifications.recordQueued(notification, {
        roles: ["super_admin"],
        ...(notification.queueJobRecordId ? { correlationId: notification.queueJobRecordId } : {})
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }
}
