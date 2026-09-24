import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

/**
 * Spec 046: the data categories a retention policy governs (D1). Consent records, audit logs,
 * feature flag / offer / routing history, routing decisions, billing rows and staff accounts are
 * never in scope and have no category on purpose.
 */
export const RETENTION_CATEGORIES = [
  "quote_requests",
  "quote_documents",
  "contact_messages",
  "partner_applications",
  "waitlist",
  "ai_traces",
  "webhook_payloads",
  "messaging_references"
] as const;

export const RETENTION_DAYS_MIN = 30;
export const RETENTION_DAYS_MAX = 3650;
/** A preview freezes at most this many subjects per category; the rest waits for the next batch. */
export const RETENTION_BATCH_CAP_PER_CATEGORY = 500;
/** A previewed batch can be approved during this window only (D2). */
export const RETENTION_PREVIEW_TTL_HOURS = 24;

export const retentionCategorySchema = z.enum(RETENTION_CATEGORIES);
/** Batch subjects: the categories plus orphan prospects, which an erasure (D3) can reach directly. */
export const retentionSubjectKindSchema = z.enum([...RETENTION_CATEGORIES, "prospects"]);
export const retentionPolicySourceSchema = z.enum(["default", "global", "country"]);
export const retentionAnchorSchema = z.enum(["last_activity", "created_at", "reviewed_at", "country_public_since", "occurred_at"]);
export const anonymizationBatchKindSchema = z.enum(["retention", "erasure"]);
/**
 * `interrupted`: the batch was approved and its execution started but did not complete; the counts
 * record what was done. It is terminal: the remaining rows stay eligible for a new preview.
 */
export const anonymizationBatchStatusSchema = z.enum(["previewed", "executed", "refused", "expired", "interrupted"]);
export const erasureLookupSchema = z.enum(["public_reference", "email"]);

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** 8 digits or more, optionally separated by spaces, dots, dashes or a leading/inner `+`. */
const PHONE_IN_TEXT = /\+?\d(?:[\s.+-]?\d){7,}/;
/** ISO dates (2026-09-24) have 8 digits but are legitimate in a reason, so they are removed first. */
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

export function reasonCarriesContact(value: string): boolean {
  return EMAIL_IN_TEXT.test(value) || PHONE_IN_TEXT.test(value.replace(ISO_DATE, " "));
}

/**
 * The batch is the durable proof of an anonymization, so its reasons are stored for years: they
 * must never carry the e-mail address or the phone number the erasure was asked for.
 */
export const retentionReasonSchema = reasonSchema
  .max(500)
  .refine((value) => !reasonCarriesContact(value), { message: "Le motif ne doit pas contenir d'adresse e-mail ni de numero de telephone" });

export const retentionPoliciesQuerySchema = z.object({
  countryId: uuidSchema.optional()
});

export const retentionPolicyUpsertSchema = z.object({
  countryId: uuidSchema.optional(),
  category: retentionCategorySchema,
  /** `null` removes the override and falls back to the next level (country > global > default). */
  retentionDays: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX).nullable(),
  reason: retentionReasonSchema
});

export const retentionPolicyItemSchema = z.object({
  category: retentionCategorySchema,
  retentionDays: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX),
  source: retentionPolicySourceSchema,
  anchor: retentionAnchorSchema,
  defaultRetentionDays: z.number().int(),
  globalRetentionDays: z.number().int().nullable(),
  countryRetentionDays: z.number().int().nullable(),
  overrideReason: z.string().nullable(),
  overrideUpdatedAt: dateTimeStringSchema.nullable()
});

/** For the admin country selector: every country, sorted by ISO code, these four fields only. */
export const retentionCountryOptionSchema = z.object({
  id: uuidSchema,
  isoCode: z.string(),
  name: z.string(),
  status: z.string()
});

export const retentionPoliciesResponseSchema = z.object({
  countryId: uuidSchema.nullable(),
  purgeEnabled: z.boolean(),
  items: z.array(retentionPolicyItemSchema),
  countries: z.array(retentionCountryOptionSchema)
});

export const retentionPreviewRequestSchema = z.object({
  countryId: uuidSchema.optional(),
  categories: z.array(retentionCategorySchema).min(1).optional(),
  reason: retentionReasonSchema
});

export const retentionErasurePreviewRequestSchema = z.object({
  publicReference: nonEmptyStringSchema.max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  reason: retentionReasonSchema
}).refine((value) => (value.publicReference === undefined) !== (value.email === undefined), {
  message: "Exactly one of publicReference or email is required"
});

export const retentionBatchApproveRequestSchema = z.object({
  reason: retentionReasonSchema
});

export const retentionBatchCountSchema = z.object({
  subject: retentionSubjectKindSchema,
  selected: z.number().int().min(0),
  anonymized: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
  moreRemaining: z.boolean()
});

/** Batch metadata and counts only: no target id, no personal data. */
export const retentionBatchSchema = z.object({
  id: uuidSchema,
  kind: anonymizationBatchKindSchema,
  status: anonymizationBatchStatusSchema,
  countryId: uuidSchema.nullable(),
  categories: z.array(retentionCategorySchema),
  erasureLookup: erasureLookupSchema.nullable(),
  reason: z.string(),
  requestedById: z.string().nullable(),
  approvedById: z.string().nullable(),
  approvalReason: z.string().nullable(),
  counts: z.array(retentionBatchCountSchema),
  totalSelected: z.number().int().min(0),
  moreRemaining: z.boolean(),
  previewExpiresAt: dateTimeStringSchema,
  approvedAt: dateTimeStringSchema.nullable(),
  executedAt: dateTimeStringSchema.nullable(),
  createdAt: dateTimeStringSchema
});

export const retentionBatchListResponseSchema = z.object({
  purgeEnabled: z.boolean(),
  items: z.array(retentionBatchSchema)
});

export type RetentionCategory = z.infer<typeof retentionCategorySchema>;
export type RetentionSubjectKind = z.infer<typeof retentionSubjectKindSchema>;
export type RetentionPolicySource = z.infer<typeof retentionPolicySourceSchema>;
export type RetentionAnchor = z.infer<typeof retentionAnchorSchema>;
export type AnonymizationBatchKind = z.infer<typeof anonymizationBatchKindSchema>;
export type AnonymizationBatchStatus = z.infer<typeof anonymizationBatchStatusSchema>;
export type ErasureLookup = z.infer<typeof erasureLookupSchema>;
export type RetentionPoliciesQuery = z.infer<typeof retentionPoliciesQuerySchema>;
export type RetentionPolicyUpsert = z.infer<typeof retentionPolicyUpsertSchema>;
export type RetentionPolicyItem = z.infer<typeof retentionPolicyItemSchema>;
export type RetentionCountryOption = z.infer<typeof retentionCountryOptionSchema>;
export type RetentionPoliciesResponse = z.infer<typeof retentionPoliciesResponseSchema>;
export type RetentionPreviewRequest = z.infer<typeof retentionPreviewRequestSchema>;
export type RetentionErasurePreviewRequest = z.infer<typeof retentionErasurePreviewRequestSchema>;
export type RetentionBatchApproveRequest = z.infer<typeof retentionBatchApproveRequestSchema>;
export type RetentionBatchCount = z.infer<typeof retentionBatchCountSchema>;
export type RetentionBatch = z.infer<typeof retentionBatchSchema>;
export type RetentionBatchListResponse = z.infer<typeof retentionBatchListResponseSchema>;
