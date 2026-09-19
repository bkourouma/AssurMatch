import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";
import { maskEmail } from "./email/email-delivery.service";
import { QuoteEmailTemplateNotSafeError, QuoteEmailTemplateService } from "./email/quote-email-template.service";
import type { NotificationRecord, NotificationsService } from "./notifications.module";

export type DeliverableQuoteNotificationType =
  | "visitor_quote_confirmation"
  | "visitor_quote_non_routable"
  | "broker_lead_assigned";

const DELIVERABLE_TYPES = new Set<DeliverableQuoteNotificationType>([
  "visitor_quote_confirmation",
  "visitor_quote_non_routable",
  "broker_lead_assigned"
]);

/** A row is due while it has never been delivered and has not exhausted its retries. */
const DUE_STATUSES = new Set(["pending", "queued", "retryable"]);

export const DEFAULT_QUOTE_NOTIFICATION_RETRY_CAP = 3;

export interface QuoteNotificationQuoteLookup {
  id: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
  prospectId: string;
  routingStatus: string;
}

export interface QuoteNotificationProspectLookup {
  id: string;
  displayName?: string;
  emailNormalized: string;
}

export interface QuoteNotificationPartnerLookup {
  id: string;
  legalName: string;
  primaryEmail?: string;
}

export interface QuoteNotificationDeliveryDeps {
  notifications: NotificationsService;
  email: AuthEmailDeliveryPort;
  templates: QuoteEmailTemplateService;
  audit: AuditLogWriter;
  quotes: { findById(id: string): Promise<QuoteNotificationQuoteLookup | undefined> };
  prospects: { findById(id: string): Promise<QuoteNotificationProspectLookup | undefined> };
  partners: { findById(id: string): Promise<QuoteNotificationPartnerLookup | undefined> };
  retryCap?: number;
}

export interface QuoteNotificationDeliveryOutcome {
  notificationId: string;
  type: string;
  status: "sent" | "retryable" | "failed" | "not_configured";
  reason?: string;
}

export interface QuoteNotificationDeliveryRun {
  due: number;
  processed: number;
  sent: number;
  retryable: number;
  failed: number;
  notConfigured: number;
  outcomes: QuoteNotificationDeliveryOutcome[];
}

/**
 * Spec 044: drains the quote notification backlog into the existing email delivery service.
 *
 * The notification row is the state, which is what makes the worker idempotent: a row leaves
 * `queued` as part of being handled, so running the worker twice never sends twice.
 */
export class QuoteNotificationDeliveryService {
  constructor(private readonly deps: QuoteNotificationDeliveryDeps) {}

  async processDueNotifications(options: { limit?: number } = {}): Promise<QuoteNotificationDeliveryRun> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const all = await this.deps.notifications.list();
    const due = all.filter((notification) => this.isDue(notification));
    const batch = due.slice(0, limit);
    const run: QuoteNotificationDeliveryRun = { due: due.length, processed: 0, sent: 0, retryable: 0, failed: 0, notConfigured: 0, outcomes: [] };

    for (const notification of batch) {
      const outcome = await this.deliver(notification);
      run.processed += 1;
      run.outcomes.push(outcome);
      if (outcome.status === "sent") run.sent += 1;
      else if (outcome.status === "retryable") run.retryable += 1;
      else if (outcome.status === "failed") run.failed += 1;
      else run.notConfigured += 1;
    }
    return run;
  }

  private isDue(notification: NotificationRecord): boolean {
    return DELIVERABLE_TYPES.has(notification.type as DeliverableQuoteNotificationType) && DUE_STATUSES.has(notification.emailStatus);
  }

  private async deliver(notification: NotificationRecord): Promise<QuoteNotificationDeliveryOutcome> {
    let payload: AuthEmailPayload;
    try {
      payload = await this.render(notification);
    } catch (error) {
      // A template that cannot be rendered safely, or a recipient that cannot be resolved, is a
      // terminal failure: retrying would produce the same result and hide the problem.
      const reason = error instanceof QuoteEmailTemplateNotSafeError ? "forbidden_public_wording" : reasonOf(error);
      await this.mark(notification, "failed");
      this.auditOutcome(notification, "failed", reason, error instanceof QuoteEmailTemplateNotSafeError ? { wording: error.wording } : {});
      return { notificationId: notification.id, type: notification.type, status: "failed", reason };
    }

    const result = await this.deps.email.send(payload);
    const status = result?.status ?? "sent";
    if (status === "sent" || status === "previewed") {
      await this.mark(notification, "sent");
      this.auditOutcome(notification, "sent", status === "previewed" ? "previewed" : "delivered", { recipientMasked: maskEmail(payload.to) });
      return { notificationId: notification.id, type: notification.type, status: "sent", ...(status === "previewed" ? { reason: "previewed" } : {}) };
    }
    if (status === "not_configured") {
      // Deliberately not a failure: a disabled mailer must not consume the backlog an operator needs.
      this.auditOutcome(notification, "refused", "email_not_configured", {});
      return { notificationId: notification.id, type: notification.type, status: "not_configured", reason: "email_not_configured" };
    }

    const cap = this.deps.retryCap ?? DEFAULT_QUOTE_NOTIFICATION_RETRY_CAP;
    const retryCount = notification.retryCount + 1;
    const exhausted = retryCount >= cap;
    await this.mark(notification, exhausted ? "failed" : "retryable", retryCount);
    this.auditOutcome(notification, "failed", exhausted ? "retry_cap_reached" : "transport_failed", {
      retryCount,
      ...(result?.errorClass ? { errorClass: result.errorClass } : {})
    });
    return {
      notificationId: notification.id,
      type: notification.type,
      status: exhausted ? "failed" : "retryable",
      reason: exhausted ? "retry_cap_reached" : "transport_failed"
    };
  }

  private async render(notification: NotificationRecord): Promise<AuthEmailPayload> {
    if (notification.type === "broker_lead_assigned") return this.renderBroker(notification);
    return this.renderVisitor(notification);
  }

  private async renderVisitor(notification: NotificationRecord): Promise<AuthEmailPayload> {
    const quote = await this.deps.quotes.findById(notification.payloadReference);
    if (!quote) throw new Error("recipient_unresolved");
    assertQuoteScope(quote);
    const prospect = await this.deps.prospects.findById(quote.prospectId);
    if (!prospect?.emailNormalized) throw new Error("recipient_unresolved");
    return this.deps.templates.visitor({
      to: prospect.emailNormalized,
      ...(prospect.displayName ? { displayName: prospect.displayName } : {}),
      publicReference: quote.publicReference,
      countryCode: quote.countryCode,
      productKey: quote.productKey,
      routed: notification.type === "visitor_quote_confirmation"
    });
  }

  private async renderBroker(notification: NotificationRecord): Promise<AuthEmailPayload> {
    const partnerTenantId = notification.recipientScope.startsWith("partner:")
      ? notification.recipientScope.slice("partner:".length)
      : undefined;
    if (!partnerTenantId) throw new Error("recipient_unresolved");
    const [partner, quote] = await Promise.all([
      this.deps.partners.findById(partnerTenantId),
      this.deps.quotes.findById(notification.payloadReference)
    ]);
    if (!partner?.primaryEmail || !quote) throw new Error("recipient_unresolved");
    assertQuoteScope(quote);
    return this.deps.templates.brokerLead({
      to: partner.primaryEmail,
      partnerLegalName: partner.legalName,
      publicReference: quote.publicReference,
      countryCode: quote.countryCode,
      productKey: quote.productKey
    });
  }

  private async mark(notification: NotificationRecord, emailStatus: NotificationRecord["emailStatus"], retryCount?: number): Promise<void> {
    // WhatsApp is passed through untouched: this spec must not open a channel that ships disabled.
    await this.deps.notifications.updateDelivery(notification.id, notification.whatsAppStatus, emailStatus, retryCount);
  }

  private auditOutcome(notification: NotificationRecord, result: "sent" | "failed" | "refused", reason: string, context: Record<string, unknown>): void {
    this.deps.audit.write({
      action: result === "sent" ? "quote_notification.delivered" : "quote_notification.delivery_refused",
      targetType: "Notification",
      targetId: notification.id,
      result: result === "sent" ? "success" : result === "failed" ? "failed" : "refused",
      reason,
      context: { type: notification.type, recipientScope: notification.recipientScope, ...context }
    });
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "render_failed";
}

/**
 * `QuoteRequestRecord` declares `countryCode` and `productKey`, but the table stores only the ids and
 * the Prisma repository strips the codes on write, so a record read back from PostgreSQL has them
 * undefined. Rendering a message around undefined values would ship an email full of blanks; the
 * caller resolves them, and this turns a silent gap into a named, audited refusal.
 */
function assertQuoteScope(quote: QuoteNotificationQuoteLookup): void {
  if (!quote.publicReference || !quote.countryCode || !quote.productKey) throw new Error("quote_scope_unresolved");
}
