import { z } from "zod";
import { stripControlCharacters } from "./content-safety";

/**
 * Spec 062 (D-10): data-subject requests (access, rectification, erasure) created by the visitor
 * from the tracking space and processed by the compliance team. Nothing is erased from here: the
 * `start-erasure` action only creates the spec 046 erasure preview.
 */

export const DATA_REQUEST_TYPES = ["access", "rectification", "erasure"] as const;
export const DATA_REQUEST_STATUSES = ["received", "in_review", "completed", "rejected"] as const;
/** Statuses that count as "open" (one open request per quote request and type). */
export const DATA_REQUEST_OPEN_STATUSES = ["received", "in_review"] as const;
export const DATA_REQUEST_DETAIL_MAX = 1000;
export const DATA_REQUEST_DECISION_NOTE_MAX = 1000;
/** Indicative deadline (`createdAt + 30 days`), to be confirmed per country. */
export const DATA_REQUEST_DUE_DAYS = 30;

/** Reference `DR-` + 8 unguessable characters; this alphabet has no 0/O/1/I lookalikes. */
export const DATA_REQUEST_REFERENCE_PREFIX = "DR-";
export const DATA_REQUEST_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DATA_REQUEST_REFERENCE_LENGTH = 8;
export const DATA_REQUEST_REFERENCE_PATTERN = /^DR-[A-Z0-9]{8}$/;

export function isDataRequestReference(value: unknown): value is string {
  return typeof value === "string" && DATA_REQUEST_REFERENCE_PATTERN.test(value);
}

export const dataRequestTypeSchema = z.enum(DATA_REQUEST_TYPES);
export const dataRequestStatusSchema = z.enum(DATA_REQUEST_STATUSES);
export const dataRequestReferenceSchema = z.string().regex(DATA_REQUEST_REFERENCE_PATTERN, "invalid data request reference");

export type DataRequestType = z.output<typeof dataRequestTypeSchema>;
export type DataRequestStatus = z.output<typeof dataRequestStatusSchema>;

/** Control characters (a NUL byte included) are stripped before the length check and the storage. */
const optionalText = (max: number) => z.preprocess(
  (value) => {
    const text = typeof value === "string" ? stripControlCharacters(value) : value;
    return typeof text === "string" && text.trim() === "" ? undefined : text;
  },
  z.string().trim().max(max).optional()
);

// ---------------------------------------------------------------------------------------------
// Visitor (token 054)
// ---------------------------------------------------------------------------------------------

/** `POST /quote-requests/:publicReference/data-requests?token=`; `website` is the honeypot. */
export const dataRequestCreateSchema = z.object({
  type: dataRequestTypeSchema,
  detail: optionalText(DATA_REQUEST_DETAIL_MAX),
  website: z.string().max(200).optional()
}).strict();

export type DataRequestCreateRequest = z.input<typeof dataRequestCreateSchema>;
export type DataRequestCreate = z.output<typeof dataRequestCreateSchema>;

export const dataRequestCreateResultSchema = z.object({
  reference: dataRequestReferenceSchema,
  type: dataRequestTypeSchema,
  status: z.literal("received"),
  acknowledgedByEmail: z.literal(true)
});

export const visitorDataRequestSchema = z.object({
  reference: dataRequestReferenceSchema,
  type: dataRequestTypeSchema,
  status: dataRequestStatusSchema,
  createdAt: z.string(),
  dueAt: z.string(),
  closedAt: z.string().optional()
});

export const visitorDataRequestListSchema = z.object({ items: z.array(visitorDataRequestSchema) });

export type DataRequestCreateResult = z.output<typeof dataRequestCreateResultSchema>;
export type VisitorDataRequest = z.output<typeof visitorDataRequestSchema>;
export type VisitorDataRequestList = z.output<typeof visitorDataRequestListSchema>;

// ---------------------------------------------------------------------------------------------
// Admin (compliance_admin / super_admin; support only gets the minimal list/detail fields)
// ---------------------------------------------------------------------------------------------

export const adminDataRequestQuerySchema = z.object({
  status: dataRequestStatusSchema.optional(),
  type: dataRequestTypeSchema.optional(),
  cursor: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

/**
 * List row: reference, type, status and deadline are safe for the support role; `quoteReference` and
 * `locale` are only sent to the compliance roles.
 */
export const adminDataRequestListItemSchema = z.object({
  id: z.string(),
  reference: dataRequestReferenceSchema,
  type: dataRequestTypeSchema,
  status: dataRequestStatusSchema,
  createdAt: z.string(),
  dueAt: z.string(),
  overdue: z.boolean().default(false),
  /** Public reference (`QR-…`) of the quote request; absent for the support role. */
  quoteReference: z.string().optional(),
  /** Language of the visitor's e-mails; absent for the support role. */
  locale: z.enum(["fr", "en"]).optional()
});

export const adminDataRequestListSchema = z.object({
  items: z.array(adminDataRequestListItemSchema),
  nextCursor: z.string().nullable()
});

export const adminDataRequestHistoryEntrySchema = z.object({
  action: z.string(),
  at: z.string(),
  actorId: z.string().optional()
});

/**
 * Detail view. `detail` (personal data written by the visitor), `quoteRequestId`/`publicReference`
 * and `decisionNote` are absent for the support role.
 */
export const adminDataRequestDetailSchema = adminDataRequestListItemSchema.extend({
  detail: z.string().optional(),
  quoteRequestId: z.string().optional(),
  publicReference: z.string().optional(),
  acknowledgedAt: z.string().optional(),
  reviewedById: z.string().optional(),
  reviewedAt: z.string().optional(),
  decidedById: z.string().optional(),
  decidedAt: z.string().optional(),
  decisionNote: z.string().optional(),
  erasureBatchId: z.string().optional(),
  /** True while an erasure request is open, i.e. `start-erasure` can create its preview (absent for the support role). */
  erasureAllowed: z.boolean().optional(),
  history: z.array(adminDataRequestHistoryEntrySchema).default([])
});

export type AdminDataRequestQuery = z.output<typeof adminDataRequestQuerySchema>;
export type AdminDataRequestListItem = z.output<typeof adminDataRequestListItemSchema>;
export type AdminDataRequestList = z.output<typeof adminDataRequestListSchema>;
export type AdminDataRequestHistoryEntry = z.output<typeof adminDataRequestHistoryEntrySchema>;
export type AdminDataRequestDetail = z.output<typeof adminDataRequestDetailSchema>;

/** `POST /admin/data-requests/:id/take` and `/start-erasure` carry no payload. */
export const dataRequestTakeSchema = z.object({}).strict();
export const dataRequestStartErasureSchema = z.object({}).strict();
/** `POST /admin/data-requests/:id/complete`. */
export const dataRequestCompleteSchema = z.object({ note: optionalText(DATA_REQUEST_DECISION_NOTE_MAX) }).strict();
/** `POST /admin/data-requests/:id/reject`: the internal note is mandatory. */
export const dataRequestRejectSchema = z.object({ note: z.string().transform(stripControlCharacters).pipe(z.string().trim().min(1).max(DATA_REQUEST_DECISION_NOTE_MAX)) }).strict();

export type DataRequestComplete = z.output<typeof dataRequestCompleteSchema>;
export type DataRequestReject = z.output<typeof dataRequestRejectSchema>;

/** Allowed transitions (`received -> in_review -> completed|rejected`, or straight from `received`). */
export const DATA_REQUEST_TRANSITIONS: Readonly<Record<DataRequestStatus, readonly DataRequestStatus[]>> = {
  received: ["in_review", "completed", "rejected"],
  in_review: ["completed", "rejected"],
  completed: [],
  rejected: []
};

export function canTransitionDataRequest(from: DataRequestStatus, to: DataRequestStatus): boolean {
  return DATA_REQUEST_TRANSITIONS[from].includes(to);
}
