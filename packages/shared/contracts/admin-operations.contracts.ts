import { z } from "zod";
import { reasonSchema, uuidSchema } from "../validation/common.schemas";

/**
 * Spec 056: admin operations consoles (quote requests, manual review, lead assignments, contact
 * messages, audit logs, routing history). Every list answers `{ items, total, page, pageSize }`.
 */

/** A `YYYY-MM-DD` day or a full ISO date-time; anything `Date.parse` rejects is refused. */
const dateFilterSchema = z.string().trim().min(1).max(40).refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date filter");

const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(200).default(50);

export const adminQuoteRequestStatusSchema = z.enum(["created", "manual_review", "routed", "non_routable", "duplicate", "spam_blocked", "cancelled"]);
export const adminRoutingStatusSchema = z.enum([
  "not_started",
  "eligible",
  "assigned",
  "blocked",
  "no_broker_available",
  "manual_review_required",
  "pending_manual_assignment"
]);

export const adminOperationsQuoteRequestQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  countryId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  status: adminQuoteRequestStatusSchema.optional(),
  routingStatus: adminRoutingStatusSchema.optional(),
  reference: z.string().trim().min(1).max(64).optional(),
  from: dateFilterSchema.optional(),
  to: dateFilterSchema.optional()
});

export const adminQuoteReviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("route"), reason: reasonSchema }),
  z.object({ decision: z.literal("assign"), partnerTenantId: uuidSchema, reason: reasonSchema }),
  z.object({ decision: z.literal("non_routable"), reason: reasonSchema }),
  z.object({ decision: z.literal("duplicate"), reason: reasonSchema, duplicateOfReference: z.string().trim().min(1).max(64).optional() })
]);

export const adminLeadAssignmentStatusSchema = z.enum(["assigned", "broker_notified", "seen", "accepted", "received", "contacted", "rejected", "closed", "disputed"]);

export const adminOperationsLeadAssignmentQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  countryCode: z.string().trim().min(2).max(3).transform((value) => value.toUpperCase()).optional(),
  productKey: z.string().trim().min(1).max(64).optional(),
  partnerTenantId: uuidSchema.optional(),
  status: adminLeadAssignmentStatusSchema.optional(),
  quoteRequestId: uuidSchema.optional(),
  from: dateFilterSchema.optional(),
  to: dateFilterSchema.optional()
});

export const adminContactMessageStatusSchema = z.enum(["new", "handled", "spam"]);

export const adminContactMessageStatusUpdateSchema = z.object({
  status: adminContactMessageStatusSchema,
  reason: z.string().trim().max(500).optional()
});

export const adminAuditLogQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  actorId: z.string().trim().min(1).max(128).optional(),
  /** Prefix match: `quote_request` finds `quote_request.created`, `quote_request.refused`, ... */
  action: z.string().trim().min(1).max(128).optional(),
  targetType: z.string().trim().min(1).max(128).optional(),
  targetId: z.string().trim().min(1).max(128).optional(),
  result: z.enum(["success", "refused", "failed"]).optional(),
  from: dateFilterSchema.optional(),
  to: dateFilterSchema.optional()
});

export const adminRoutingHistoryQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  result: z.enum(["assigned", "blocked", "no_broker_available", "pending_manual_assignment"]).optional(),
  countryId: uuidSchema.optional(),
  quoteRequestId: uuidSchema.optional(),
  from: dateFilterSchema.optional(),
  to: dateFilterSchema.optional()
});

export const AUDIT_LOG_EXPORT_MAX_ROWS = 5000;

export type AdminOperationsQuoteRequestQuery = z.output<typeof adminOperationsQuoteRequestQuerySchema>;
export type AdminQuoteReviewDecision = z.output<typeof adminQuoteReviewDecisionSchema>;
export type AdminOperationsLeadAssignmentQuery = z.output<typeof adminOperationsLeadAssignmentQuerySchema>;
export type AdminContactMessageStatusUpdate = z.output<typeof adminContactMessageStatusUpdateSchema>;
export type AdminAuditLogQuery = z.output<typeof adminAuditLogQuerySchema>;
export type AdminRoutingHistoryQuery = z.output<typeof adminRoutingHistoryQuerySchema>;

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminQuoteRequestListItem {
  id: string;
  publicReference: string;
  countryId: string;
  countryCode: string | null;
  productId: string;
  productKey: string | null;
  status: string;
  routingStatus: string;
  duplicateStatus: string;
  refusalReason: string | null;
  assignmentCount: number;
  selectedOfferId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRoutingDecisionView {
  id: string;
  quoteRequestId: string;
  result: string;
  candidateCount: number;
  selectedPartners: Array<{ partnerTenantId: string; legalName: string | null }>;
  excludedCandidates: Array<{ partnerTenantId: string; legalName: string | null; reasons: string[] }>;
  reasons: string[];
  createdAt: string;
}

export interface AdminQuoteAssignmentView {
  id: string;
  partnerTenantId: string;
  partnerLegalName: string | null;
  status: string;
  assignmentReason: string;
  recipientCount: number;
  assignedAt: string;
  lastBrokerActionAt: string | null;
}

export interface AdminQuoteRequestDetail extends AdminQuoteRequestListItem {
  piiMasked: boolean;
  manualReviewReason: string | null;
  reviewedById: string | null;
  duplicateOfQuoteRequestId: string | null;
  anonymized: boolean;
  reviewOpen: boolean;
  contact: { displayName: string | null; email: string | null; phone: string | null } | null;
  answers: Record<string, unknown>;
  consent: {
    consentRecordId: string;
    status: string | null;
    intendedRecipient: string | null;
    grantedAt: string | null;
    withdrawnAt: string | null;
    channel: string | null;
  };
  selectedOffer: {
    offerId: string;
    name: string | null;
    partnerTenantId: string | null;
    partnerLegalName: string | null;
    /** `retained` when the offer's partner received the lead, `not_retained` when another did, `pending` otherwise. */
    outcome: "retained" | "not_retained" | "pending";
  } | null;
  routingDecisions: AdminRoutingDecisionView[];
  assignments: AdminQuoteAssignmentView[];
  documents: Array<{ id: string; label: string; documentKind: string; scanStatus: string; status: string; sharedWithBroker: boolean; createdAt: string }>;
}

export interface AdminQuoteReviewQueueItem extends AdminQuoteRequestListItem {
  manualReviewReason: string | null;
  candidates: Array<{ partnerTenantId: string; legalName: string; plan: string; eligible: boolean; reasons: string[] }>;
}

export interface AdminQuoteReviewResult {
  quoteRequestId: string;
  decision: AdminQuoteReviewDecision["decision"];
  status: string;
  routingStatus: string;
  assignmentIds: string[];
  reviewedAt: string;
}

export interface AdminLeadAssignmentListItem {
  id: string;
  quoteRequestId: string;
  publicReference: string | null;
  countryCode: string | null;
  productKey: string | null;
  partnerTenantId: string;
  partnerLegalName: string | null;
  status: string;
  assignmentReason: string;
  recipientCount: number;
  assignedAt: string;
  lastBrokerActionAt: string | null;
}

export interface AdminAuditLogItem {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  result: "success" | "refused" | "failed";
  reason: string | null;
  scope: Record<string, unknown>;
  context: Record<string, unknown>;
  correlationId: string | null;
  occurredAt: string;
}

export interface AdminAuditLogExport {
  fileName: string;
  contentType: "text/csv; charset=utf-8";
  rowCount: number;
  truncated: boolean;
  csv: string;
}

export interface AdminContactMessageStatusResult {
  id: string;
  publicReference: string;
  previousStatus: string;
  status: string;
  handledAt: string | null;
}
