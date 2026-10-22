import type { ActorContext } from "../common/types";

/**
 * Spec 062: ports shared by the messaging, notifications, SLA and data-request implementations.
 * They are the only contract between those parts: each side implements or consumes exactly these
 * signatures. Payloads carry identifiers only, never message text, file names or visitor data.
 */

/** The quote request as the messaging and data-request services need it (`QuoteRequestRecord` satisfies it). */
export interface MessagingQuote {
  id: string;
  publicReference: string;
  status: string;
  refusalReason?: string | undefined;
  anonymizedAt?: Date | string | null | undefined;
  /** Language of the request: `fr` (default) or `en`. */
  language?: string | undefined;
}

type QueueResult = Promise<unknown>;

/**
 * Implemented by `QuoteNotificationService` (notifications implementer). All methods are idempotent
 * through a persisted `dedupeKey` and must never throw on a repeat.
 *
 * Coalescing: message notifications use a 15-minute bucket (`bucket` = floor(epochMs / 15 min)), so a
 * burst of messages produces one notification (in-app and e-mail) per recipient and conversation.
 */
export interface LeadMessagingNotificationsPort {
  /** E-mail to the visitor: pointer only ("you have a new message from {broker}"). Type `visitor_broker_message`. */
  queueVisitorBrokerMessage(
    quote: Pick<MessagingQuote, "id" | "publicReference">,
    event: { assignmentId: string; partnerTenantId: string; bucket: string },
    actor: ActorContext
  ): QueueResult;
  /**
   * E-mail to the visitor: pointer only ("{broker} asks you for documents"). Type `visitor_documents_requested`.
   * Coalesced like the messages: one per assignment, broker and 15-minute `bucket` (`requestId` is kept for
   * the in-app / audit side, it is not part of the dedupe key).
   */
  queueVisitorDocumentsRequested(
    quote: Pick<MessagingQuote, "id" | "publicReference">,
    event: { assignmentId: string; partnerTenantId: string; requestId: string; bucket: string },
    actor: ActorContext
  ): QueueResult;
  /** In-app + pointer e-mail to the assigned broker. Type `broker_visitor_message`. */
  queueBrokerVisitorMessage(
    quote: Pick<MessagingQuote, "id" | "publicReference">,
    event: { assignmentId: string; partnerTenantId: string; bucket: string },
    actor: ActorContext
  ): QueueResult;
  /** In-app + pointer e-mail to the assigned broker when the visitor fulfils a document request. Type `broker_document_received` (existing). */
  queueBrokerDocumentReceived(
    quote: Pick<MessagingQuote, "id" | "publicReference">,
    event: { assignmentId: string; partnerTenantId: string; requestId: string; bucket: string },
    actor: ActorContext
  ): QueueResult;
}

/** Acknowledgement and closure are implemented by `QuoteNotificationService`; the alert by a runtime adapter. */
export interface DataRequestNotificationsPort {
  /** Acknowledgement e-mail to the visitor with the reference. Type `visitor_data_request_acknowledged`. Dedupe: `visitor_data_request_acknowledged:{dataRequestId}`. */
  queueVisitorAcknowledgement(
    quote: Pick<MessagingQuote, "id" | "publicReference">,
    event: { dataRequestId: string; reference: string; requestType: string; dueAt: string },
    actor: ActorContext
  ): QueueResult;
  /** Pointer e-mail to the visitor once the request is completed or rejected. Type `visitor_data_request_closed`. No decision note, no reason. */
  queueVisitorClosure(
    quote: Pick<MessagingQuote, "id" | "publicReference">,
    event: { dataRequestId: string; reference: string },
    actor: ActorContext
  ): QueueResult;
  /**
   * Alert to the compliance team. NOT implemented by `QuoteNotificationService`: the runtime adapts it onto
   * `AdminAlertsService.raise` (type `data_request_received`, `dedupe: "once"`, conditionKey
   * `data_request_received:{dataRequestId}`), which already gives the admin alerts center entry and the
   * compliance pointer e-mail.
   */
  queueComplianceAlert(event: { dataRequestId: string; reference: string; requestType: string }, actor: ActorContext): QueueResult;
}

/**
 * Implemented by `LeadAssignmentService.recordFirstVisibleReply` (SLA implementer, spec 062 E-08).
 * Idempotent: only the first call after the assignment (or its reassignment) writes
 * `LeadAssignment.firstVisibleReplyAt`; later calls are no-ops. It also treats the reply as a broker
 * action (`lastBrokerActionAt`) like a proposal does today.
 */
export interface FirstVisibleReplyPort {
  recordFirstVisibleReply(assignmentId: string, at: Date, actor: ActorContext): Promise<void>;
}

/** 15-minute coalescing bucket shared by the notification types above. */
export const MESSAGE_NOTIFICATION_BUCKET_MS = 15 * 60 * 1000;

export function messageNotificationBucket(at: Date): string {
  return String(Math.floor(at.getTime() / MESSAGE_NOTIFICATION_BUCKET_MS));
}
