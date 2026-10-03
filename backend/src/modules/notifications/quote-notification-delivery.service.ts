import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";
import { maskEmail } from "./email/email-delivery.service";
import { QuoteEmailTemplateNotSafeError, QuoteEmailTemplateService, type VisitorEmailStep } from "./email/quote-email-template.service";
import type { NotificationRecord, NotificationsService } from "./notifications.module";
import type { VisitorEmailNotificationType } from "./quote-notification.service";

export type DeliverableQuoteNotificationType = VisitorEmailNotificationType | "broker_lead_assigned" | "broker_visitor_response";

/**
 * Spec 054 R4: the step each visitor type announces. The two spec 044 types stay renderable for the
 * rows queued before the spec: a "confirmation" is rendered as "received", never as "transmitted",
 * because spec 044 also queued it for requests held in manual review.
 */
const VISITOR_STEP: Record<VisitorEmailNotificationType, VisitorEmailStep> = {
  visitor_quote_confirmation: "received",
  visitor_quote_non_routable: "not_transmitted",
  visitor_quote_received: "received",
  visitor_quote_in_review: "in_review",
  visitor_quote_transmitted: "transmitted",
  visitor_quote_accepted: "accepted",
  visitor_quote_reassigned: "reassigned",
  visitor_quote_closed: "closed",
  visitor_consent_withdrawn: "consent_withdrawn",
  visitor_tracking_link: "tracking_link",
  visitor_proposal_available: "proposal_available"
};

const DELIVERABLE_TYPES = new Set<string>([...Object.keys(VISITOR_STEP), "broker_lead_assigned", "broker_visitor_response"]);

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
  /** Spec 054 R3: the language of the e-mail is the language of the request. */
  language?: string | undefined;
  anonymizedAt?: Date | string | null | undefined;
}

export interface QuoteNotificationProspectLookup {
  id: string;
  displayName?: string;
  emailNormalized: string;
}

export interface QuoteNotificationPartnerLookup {
  id: string;
  legalName: string;
  tradeName?: string | undefined;
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
  /** Spec 054 R2: mints the visitor access token at render time; the clear token is never stored. */
  visitorAccess?: { issue(quoteRequestId: string, context: { reason: string }): Promise<{ token: string; expiresAt: Date }> };
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
    // Oldest first, so a request's "received" e-mail always leaves before its "transmitted" one.
    const due = all
      .filter((notification) => this.isDue(notification))
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
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
    return DELIVERABLE_TYPES.has(notification.type) && DUE_STATUSES.has(notification.emailStatus);
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
    if (notification.type === "broker_lead_assigned" || notification.type === "broker_visitor_response") return this.renderBroker(notification);
    return this.renderVisitor(notification);
  }

  /**
   * Spec 054 R2/R10: the e-mail is rendered in the language of the request, names the broker of
   * the step and carries a token minted now, so no clear token ever sits in the notification row.
   */
  private async renderVisitor(notification: NotificationRecord): Promise<AuthEmailPayload> {
    const quote = await this.deps.quotes.findById(notification.payloadReference);
    if (!quote) throw new Error("recipient_unresolved");
    assertQuoteScope(quote);
    if (quote.anonymizedAt) throw new Error("quote_anonymized");
    const prospect = await this.deps.prospects.findById(quote.prospectId);
    if (!prospect?.emailNormalized) throw new Error("recipient_unresolved");
    const step = VISITOR_STEP[notification.type as VisitorEmailNotificationType];
    const partnerTenantId = notification.eventPayload?.partnerTenantId;
    const partner = partnerTenantId ? await this.deps.partners.findById(partnerTenantId).catch(() => undefined) : undefined;
    const access = this.deps.visitorAccess ? await this.deps.visitorAccess.issue(quote.id, { reason: `notification:${notification.type}` }) : undefined;
    return this.deps.templates.visitorStep({
      step,
      to: prospect.emailNormalized,
      displayName: prospect.displayName,
      publicReference: quote.publicReference,
      countryCode: quote.countryCode,
      productKey: quote.productKey,
      locale: quote.language === "en" ? "en" : "fr",
      partnerName: partner ? partner.tradeName ?? partner.legalName : undefined,
      token: access?.token,
      tokenExpiresAt: access?.expiresAt
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
    if (notification.type === "broker_visitor_response") {
      return this.deps.templates.brokerVisitorResponse({
        to: partner.primaryEmail,
        partnerLegalName: partner.legalName,
        publicReference: quote.publicReference,
        countryCode: quote.countryCode,
        productKey: quote.productKey
      });
    }
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
