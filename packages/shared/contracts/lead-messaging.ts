import { z } from "zod";
import { dateTimeStringSchema } from "../validation/common.schemas";

/**
 * Spec 062: broker <-> visitor messaging and document requests. Shared by the API, the broker
 * back-office, the public tracking space and the compliance back-office. A conversation is the pair
 * (assignment, broker): a reassignment starts a distinct conversation for the new broker. Messages
 * are plain text, append-only, and the broker side goes through the regulated-wording guard.
 */

export const LEAD_MESSAGE_BODY_MAX = 2000;
export const LEAD_MESSAGE_ATTACHMENTS_MAX = 3;
export const LEAD_MESSAGE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAD_MESSAGE_ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
/** Hard cap of messages per assignment conversation (`THREAD_LIMIT_REACHED`). */
export const LEAD_MESSAGE_THREAD_MAX = 300;
/** Messages per page; the first page holds the most recent ones, `before` pages backwards. */
export const LEAD_MESSAGE_PAGE_SIZE = 50;
/** An identical consecutive message inside this window is refused (`DUPLICATE_MESSAGE`). */
export const LEAD_MESSAGE_DUPLICATE_WINDOW_MINUTES = 5;
/** Pointer e-mails and broker alerts are bucketed by this window (dedupe key bucket). */
export const EMAIL_POINTER_WINDOW_MINUTES = 15;
export const LEAD_MESSAGE_CLIENT_REQUEST_ID_MAX = 64;

export const DOCUMENT_REQUEST_LABEL_MAX = 120;
export const DOCUMENT_REQUEST_NOTE_MAX = 500;
/** At most this many `open` document requests per assignment (`DOCUMENT_REQUEST_LIMIT_REACHED`). */
export const DOCUMENT_REQUEST_MAX_OPEN = 10;
export const DOCUMENT_REQUEST_UPLOAD_FILES_MAX = 3;

/** Visitor rate limits (per hour), enforced by the public abuse guard and Redis counters. */
export const VISITOR_MESSAGE_RATE_LIMIT_PER_IP_PER_HOUR = 30;
export const VISITOR_MESSAGE_RATE_LIMIT_PER_CONVERSATION_PER_HOUR = 20;
export const VISITOR_UPLOAD_RATE_LIMIT_PER_IP_PER_HOUR = 20;
export const VISITOR_DATA_REQUEST_RATE_LIMIT_PER_IP_PER_HOUR = 5;
export const VISITOR_DOWNLOAD_RATE_LIMIT_PER_IP_PER_HOUR = 60;

/** Non-contractual mention shown on every conversation, in the language of the reader. */
export const LEAD_MESSAGING_NOTICE = {
  fr: "Échange avec {partnerName}. AssurMatch est une plateforme technique : ces messages ne constituent ni un contrat ni une garantie.",
  en: "Conversation with {partnerName}. AssurMatch is a technical platform: these messages are neither a contract nor a guarantee."
} as const;

export function leadMessagingNotice(locale: "fr" | "en", partnerName: string): string {
  return LEAD_MESSAGING_NOTICE[locale === "en" ? "en" : "fr"].replace("{partnerName}", partnerName);
}

export const LEAD_MESSAGE_SENDER_TYPES = ["broker", "visitor"] as const;
export const LEAD_CONVERSATION_STATES = ["open", "read_only"] as const;
/** Why a conversation is read-only (`partner_suspended` and `not_accepted` only apply to the broker side). */
export const LEAD_CONVERSATION_READ_ONLY_REASONS = ["consent_withdrawn", "lead_closed", "reassigned", "messaging_disabled", "partner_suspended", "not_accepted"] as const;
export const DOCUMENT_REQUEST_STATUSES = ["open", "fulfilled", "cancelled"] as const;
export const DOCUMENT_REQUEST_CANCEL_REASONS = ["broker", "reassigned", "closed"] as const;
/** Why the broker cannot create a document request right now (UI hints). */
export const DOCUMENT_REQUEST_BLOCKERS = ["not_accepted", "lead_closed", "consent_withdrawn", "messaging_disabled", "partner_suspended", "limit_reached"] as const;

export const leadMessageSenderTypeSchema = z.enum(LEAD_MESSAGE_SENDER_TYPES);
export const leadConversationStateSchema = z.enum(LEAD_CONVERSATION_STATES);
export const leadConversationReadOnlyReasonSchema = z.enum(LEAD_CONVERSATION_READ_ONLY_REASONS);
export const documentRequestStatusSchema = z.enum(DOCUMENT_REQUEST_STATUSES);
export const documentRequestCancelReasonSchema = z.enum(DOCUMENT_REQUEST_CANCEL_REASONS);
export const documentRequestBlockerSchema = z.enum(DOCUMENT_REQUEST_BLOCKERS);

export type LeadMessageSenderType = z.output<typeof leadMessageSenderTypeSchema>;
export type LeadConversationState = z.output<typeof leadConversationStateSchema>;
export type LeadConversationReadOnlyReason = z.output<typeof leadConversationReadOnlyReasonSchema>;
export type DocumentRequestStatus = z.output<typeof documentRequestStatusSchema>;
export type DocumentRequestCancelReason = z.output<typeof documentRequestCancelReasonSchema>;
export type DocumentRequestBlocker = z.output<typeof documentRequestBlockerSchema>;

const optionalText = (max: number) => z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().max(max).optional());

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

const clientRequestIdSchema = z.string().trim().min(8).max(LEAD_MESSAGE_CLIENT_REQUEST_ID_MAX).regex(/^[A-Za-z0-9_-]+$/, "clientRequestId must be URL-safe");
const messageBodySchema = z.string().trim().min(1).max(LEAD_MESSAGE_BODY_MAX);

/**
 * `POST .../messages` (JSON, or multipart with a `payload` JSON field and up to three `files`).
 * `clientRequestId` makes a retry idempotent (unique per assignment and sender); `website` is the
 * honeypot of the visitor form and must stay empty (a filled one gets a fake success, no write).
 */
export const leadMessageCreateSchema = z.object({
  body: messageBodySchema,
  clientRequestId: clientRequestIdSchema.optional(),
  website: z.string().max(200).optional()
}).strict();

/** Broker flavour: no honeypot. */
export const brokerLeadMessageCreateSchema = z.object({
  body: messageBodySchema,
  clientRequestId: clientRequestIdSchema.optional()
}).strict();

/** Visitor flavour: carries the honeypot. */
export const visitorLeadMessageCreateSchema = leadMessageCreateSchema;

/** `POST /broker/{starter|crm}/leads/:leadId/document-requests`. The wording guard runs in the service. */
export const documentRequestCreateSchema = z.object({
  label: z.string().trim().min(1).max(DOCUMENT_REQUEST_LABEL_MAX),
  note: optionalText(DOCUMENT_REQUEST_NOTE_MAX),
  dueAt: z.preprocess((value) => (value === "" ? undefined : value), dateTimeStringSchema.optional())
}).strict();

/** `POST .../document-requests/:requestId/cancel` (no payload today; strict so a typo is refused). */
export const documentRequestCancelSchema = z.object({}).strict();

export type LeadMessageCreateRequest = z.input<typeof leadMessageCreateSchema>;
export type LeadMessageCreate = z.output<typeof leadMessageCreateSchema>;
export type BrokerLeadMessageCreate = z.output<typeof brokerLeadMessageCreateSchema>;
export type DocumentRequestCreateRequest = z.input<typeof documentRequestCreateSchema>;
export type DocumentRequestCreate = z.output<typeof documentRequestCreateSchema>;
export type DocumentRequestCancel = z.output<typeof documentRequestCancelSchema>;

/** Query of the paginated conversation views (`before` is the opaque `nextCursor`). */
export const leadConversationQuerySchema = z.object({
  before: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LEAD_MESSAGE_PAGE_SIZE).default(LEAD_MESSAGE_PAGE_SIZE)
});

export type LeadConversationQuery = z.output<typeof leadConversationQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Views (broker and visitor share the conversation view; `mine` is relative to the reader)
// ---------------------------------------------------------------------------------------------

export const leadMessageAttachmentViewSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative()
});

export const leadMessageViewSchema = z.object({
  id: z.string(),
  senderType: leadMessageSenderTypeSchema,
  mine: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
  /** First read by the recipient (null while unread). */
  readAt: z.string().nullable(),
  /** Only clean (antivirus-passed) attachments are listed. */
  attachments: z.array(leadMessageAttachmentViewSchema).default([])
});

export const leadConversationViewSchema = z.object({
  /** Opaque hash of (assignment, broker); never a tenant identifier. */
  conversationId: z.string(),
  partnerName: z.string(),
  state: leadConversationStateSchema,
  readOnlyReason: leadConversationReadOnlyReasonSchema.nullable().default(null),
  canSend: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  notice: z.string(),
  /** Chronological order, ascending; the first page holds the most recent messages. */
  messages: z.array(leadMessageViewSchema),
  nextCursor: z.string().nullable()
});

/** `POST .../messages` success body (`201`). */
export const leadMessageSendResultSchema = z.object({ message: leadMessageViewSchema });
/** `POST .../read` success body. */
export const leadConversationReadResultSchema = z.object({ markedRead: z.number().int().nonnegative(), unreadCount: z.number().int().nonnegative() });

export type LeadMessageAttachmentView = z.output<typeof leadMessageAttachmentViewSchema>;
export type LeadMessageView = z.output<typeof leadMessageViewSchema>;
export type LeadConversationView = z.output<typeof leadConversationViewSchema>;
export type LeadMessageSendResult = z.output<typeof leadMessageSendResultSchema>;
export type LeadConversationReadResult = z.output<typeof leadConversationReadResultSchema>;

// ---------------------------------------------------------------------------------------------
// Visitor list view (`GET /quote-requests/:publicReference/conversations?token=`)
// ---------------------------------------------------------------------------------------------

export const visitorConversationSummarySchema = z.object({
  conversationId: z.string(),
  partnerName: z.string(),
  state: leadConversationStateSchema,
  readOnlyReason: leadConversationReadOnlyReasonSchema.nullable().default(null),
  canSend: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  /** Latest message only; the full thread is a separate call. */
  lastMessage: leadMessageViewSchema.nullable().default(null)
});

export const visitorConversationListSchema = z.object({
  messagingEnabled: z.boolean(),
  conversations: z.array(visitorConversationSummarySchema)
});

export type VisitorConversationSummary = z.output<typeof visitorConversationSummarySchema>;
export type VisitorConversationList = z.output<typeof visitorConversationListSchema>;

// ---------------------------------------------------------------------------------------------
// Document requests
// ---------------------------------------------------------------------------------------------

/** Broker view (`GET /broker/{starter|crm}/leads/:leadId/document-requests`). */
export const brokerDocumentRequestDocumentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string()
});

export const brokerDocumentRequestSchema = z.object({
  id: z.string(),
  label: z.string(),
  note: z.string().optional(),
  dueAt: z.string().optional(),
  status: documentRequestStatusSchema,
  createdAt: z.string(),
  fulfilledAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  cancelReason: documentRequestCancelReasonSchema.optional(),
  authorId: z.string().optional(),
  documents: z.array(brokerDocumentRequestDocumentSchema).default([])
});

export const brokerDocumentRequestListSchema = z.object({
  items: z.array(brokerDocumentRequestSchema),
  openCount: z.number().int().nonnegative(),
  maxOpen: z.number().int().positive(),
  canCreate: z.boolean(),
  blockers: z.array(documentRequestBlockerSchema).default([])
});

/** Visitor view (`GET /quote-requests/:publicReference/document-requests?token=`). */
export const visitorDocumentRequestSchema = z.object({
  id: z.string(),
  partnerName: z.string(),
  label: z.string(),
  note: z.string().optional(),
  dueAt: z.string().optional(),
  status: documentRequestStatusSchema,
  createdAt: z.string(),
  fulfilledAt: z.string().optional(),
  canUpload: z.boolean(),
  uploadedCount: z.number().int().nonnegative()
});

export const visitorDocumentRequestListSchema = z.object({ items: z.array(visitorDocumentRequestSchema) });

/** `POST /quote-requests/:publicReference/document-requests/:requestId/documents` success body (`201`). */
export const visitorDocumentUploadResultSchema = z.object({
  requestId: z.string(),
  status: documentRequestStatusSchema,
  uploaded: z.number().int().nonnegative()
});

export type BrokerDocumentRequestDocument = z.output<typeof brokerDocumentRequestDocumentSchema>;
export type BrokerDocumentRequest = z.output<typeof brokerDocumentRequestSchema>;
export type BrokerDocumentRequestList = z.output<typeof brokerDocumentRequestListSchema>;
export type VisitorDocumentRequest = z.output<typeof visitorDocumentRequestSchema>;
export type VisitorDocumentRequestList = z.output<typeof visitorDocumentRequestListSchema>;
export type VisitorDocumentUploadResult = z.output<typeof visitorDocumentUploadResultSchema>;

// ---------------------------------------------------------------------------------------------
// Admin read-only view (`GET /admin/leads/:quoteRequestId/conversations`); support gets masked bodies
// ---------------------------------------------------------------------------------------------

export const adminLeadMessageViewSchema = z.object({
  id: z.string(),
  senderType: leadMessageSenderTypeSchema,
  /** Null when masked (support role). */
  body: z.string().nullable(),
  bodyMasked: z.boolean(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  attachmentCount: z.number().int().nonnegative()
});

export const adminLeadConversationViewSchema = z.object({
  conversationId: z.string(),
  partnerName: z.string(),
  state: leadConversationStateSchema,
  readOnlyReason: leadConversationReadOnlyReasonSchema.nullable().default(null),
  messages: z.array(adminLeadMessageViewSchema)
});

export const adminLeadConversationsViewSchema = z.object({
  quoteRequestId: z.string(),
  conversations: z.array(adminLeadConversationViewSchema)
});

export type AdminLeadMessageView = z.output<typeof adminLeadMessageViewSchema>;
export type AdminLeadConversationView = z.output<typeof adminLeadConversationViewSchema>;
export type AdminLeadConversationsView = z.output<typeof adminLeadConversationsViewSchema>;

// ---------------------------------------------------------------------------------------------
// Tracking status add-on (see `public-quote-status.ts`: `messaging: { enabled, unreadCount }`)
// ---------------------------------------------------------------------------------------------

export const publicMessagingSummarySchema = z.object({
  enabled: z.boolean(),
  unreadCount: z.number().int().nonnegative()
});

export type PublicMessagingSummary = z.output<typeof publicMessagingSummarySchema>;
