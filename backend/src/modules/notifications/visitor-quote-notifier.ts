import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { VisitorTrackingAuditActions } from "../audit-logs/visitor-tracking-audit-actions";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import type { QuoteNotificationService, VisitorEmailNotificationType } from "./quote-notification.service";

const SYSTEM_ACTOR: ActorContext = { actorId: "system:visitor-quote-notifier", roles: [] };

/**
 * Spec 054 R6: only these CRM statuses are public steps. Every other pipeline move (contact
 * attempted, qualified, documents requested...) stays internal and sends nothing (FR-008).
 */
const CRM_ACCEPTED = new Set(["accepte"]);
const CLOSING_STATUSES = new Set(["gagne", "perdu", "closed"]);

export interface VisitorQuoteNotifierDeps {
  notifications: Pick<QuoteNotificationService, "queueVisitorEvent">;
  assignments: { require(id: string): Promise<LeadAssignmentRecord> };
  quotes: { findById(id: string): Promise<QuoteRequestRecord | undefined> };
  audit: AuditLogWriter;
}

/**
 * Spec 054 R6: subscriber of the lead event bus (`PartnerWebhookEventPublisher.onEvent`). It turns
 * the broker and admin actions that change the public status into visitor e-mails. The assignment
 * at submission and the manual assignment are queued by the submission service itself, so the
 * "received" e-mail always precedes the "transmitted" one; `lead.assigned` is therefore ignored.
 *
 * A failure here never reaches the lead flow: the publisher swallows it.
 */
export class VisitorQuoteNotifier {
  constructor(private readonly deps: VisitorQuoteNotifierDeps) {}

  async onLeadEvent(eventType: string, partnerTenantId: string, data: Record<string, unknown>): Promise<void> {
    const type = this.visitorStep(eventType, data);
    if (!type) return;
    const assignmentId = typeof data.leadAssignmentId === "string" ? data.leadAssignmentId : undefined;
    if (!assignmentId) return;
    const assignment = await this.deps.assignments.require(assignmentId).catch(() => undefined);
    if (!assignment) return;
    const quote = await this.deps.quotes.findById(assignment.quoteRequestId);
    if (!quote) return;
    // Consent withdrawn or data anonymized: the only e-mail left is the withdrawal confirmation.
    if (quote.status === "cancelled" || quote.anonymizedAt) {
      this.deps.audit.write({
        actor: SYSTEM_ACTOR,
        action: VisitorTrackingAuditActions.visitorNotificationSkipped,
        targetType: "QuoteRequest",
        targetId: quote.id,
        result: "refused",
        reason: quote.anonymizedAt ? "quote_anonymized" : "consent_withdrawn",
        context: { type, eventType }
      });
      return;
    }
    const previousPartnerTenantId = typeof data.previousPartnerTenantId === "string" ? data.previousPartnerTenantId : undefined;
    const routingDecisionId = typeof data.routingDecisionId === "string" ? data.routingDecisionId : undefined;
    await this.deps.notifications.queueVisitorEvent(quote, {
      type,
      assignmentId: assignment.id,
      partnerTenantId: partnerTenantId || assignment.partnerTenantId,
      ...(previousPartnerTenantId ? { previousPartnerTenantId } : {}),
      // A reassignment is one occurrence per routing decision; every other step once per partner.
      ...(type === "visitor_quote_reassigned" && routingDecisionId ? { seq: routingDecisionId } : {})
    }, SYSTEM_ACTOR);
  }

  private visitorStep(eventType: string, data: Record<string, unknown>): VisitorEmailNotificationType | undefined {
    if (eventType === "lead.accepted") return "visitor_quote_accepted";
    if (eventType === "lead.reassigned") return "visitor_quote_reassigned";
    if (eventType === "lead.status_changed") {
      const status = typeof data.status === "string" ? data.status : "";
      if (CRM_ACCEPTED.has(status)) return "visitor_quote_accepted";
      if (CLOSING_STATUSES.has(status)) return "visitor_quote_closed";
    }
    // `lead.rejected` alone sends nothing: the admin either reassigns (a "reassigned" e-mail) or the
    // space shows the request as closed for that broker.
    return undefined;
  }
}
