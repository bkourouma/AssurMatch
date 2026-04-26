import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { QueueJobRecord, QueuePort } from "../common/queues/queues.module";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import type { NotificationRecord } from "./notifications.module";

export class QuoteNotificationService {
  private readonly queuedVisitor = new Set<string>();
  private readonly queuedBroker = new Set<string>();

  constructor(
    private readonly notifications: NotificationRecord[],
    private readonly queue: QueuePort,
    private readonly audit: AuditLogWriter
  ) {}

  queueVisitor(quote: QuoteRequestRecord, actor: ActorContext): { notification: NotificationRecord; job: QueueJobRecord } | undefined {
    if (this.queuedVisitor.has(quote.id)) return undefined;
    this.queuedVisitor.add(quote.id);
    const now = new Date();
    const job = this.queue.add("visitor-quote-notifications", "visitor_quote_notification", quote.id, actor.correlationId);
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type: quote.status === "non_routable" ? "visitor_quote_non_routable" : "visitor_quote_confirmation",
      recipientScope: `visitor:${quote.publicReference}`,
      whatsAppStatus: "queued",
      emailStatus: "queued",
      payloadReference: quote.id,
      queueJobRecordId: job.id,
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.notifications.push(notification);
    this.audit.write({
      actor,
      action: QuoteAuditActions.notificationVisitorQueued,
      targetType: "Notification",
      targetId: notification.id,
      scope: { quoteRequestId: quote.id },
      result: "success",
      context: { type: notification.type }
    });
    return { notification, job };
  }

  queueBroker(quote: QuoteRequestRecord, assignment: LeadAssignmentRecord, actor: ActorContext): { notification: NotificationRecord; job: QueueJobRecord } | undefined {
    if (this.queuedBroker.has(assignment.id)) return undefined;
    this.queuedBroker.add(assignment.id);
    const now = new Date();
    const job = this.queue.add("broker-lead-notifications", "broker_lead_notification", assignment.id, actor.correlationId);
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type: "broker_lead_assigned",
      recipientScope: `partner:${assignment.partnerTenantId}`,
      whatsAppStatus: "queued",
      emailStatus: "queued",
      payloadReference: quote.id,
      queueJobRecordId: job.id,
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.notifications.push(notification);
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
}
