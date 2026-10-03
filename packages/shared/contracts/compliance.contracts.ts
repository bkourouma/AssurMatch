import { z } from "zod";
import { dateTimeStringSchema, languageCodeSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const consentPurposeSchema = z.enum(["lead_transmission", "document_upload", "technical_notification", "ai_processing", "marketing_optional", "service_quality_survey"]);
export const consentChannelSchema = z.enum(["public_web", "admin", "broker", "api"]);
export const consentTextStatusSchema = z.enum(["draft", "review", "published", "retired"]);

/** Spec 050 R5: placeholders a consent text template may use; resolved by the server when served. */
export const CONSENT_TEXT_VARIABLES = ["{{brokerName}}", "{{countryName}}", "{{productName}}", "{{contactFields}}"] as const;
export const CONSENT_TEXT_MAX_LENGTH = 20000;

export const consentTextSchema = z.object({
  id: uuidSchema.optional(),
  purpose: consentPurposeSchema,
  countryId: uuidSchema,
  productId: uuidSchema.optional(),
  channel: z.enum(["public_web", "admin", "broker", "api"]),
  recipientCategory: nonEmptyStringSchema,
  language: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
  status: consentTextStatusSchema.default("draft"),
  contentHash: nonEmptyStringSchema,
  /**
   * Spec 050 R5: the full template (variables unresolved). Optional at the domain level so the
   * fixtures that only carry a hash still load, but required by the admin route and by publication.
   */
  content: z.string().max(CONSENT_TEXT_MAX_LENGTH).optional()
});

/** Spec 050: admin creation. The hash is never accepted from the caller; the server computes it. */
export const adminConsentTextCreateSchema = z.object({
  purpose: consentPurposeSchema,
  countryId: uuidSchema,
  productId: uuidSchema.optional(),
  channel: consentChannelSchema.default("public_web"),
  recipientCategory: nonEmptyStringSchema,
  language: languageCodeSchema,
  version: nonEmptyStringSchema,
  content: z.string().trim().min(1).max(CONSENT_TEXT_MAX_LENGTH),
  reason: reasonSchema
});

export const adminConsentTextListQuerySchema = z.object({
  countryId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  purpose: consentPurposeSchema.optional(),
  language: languageCodeSchema.optional(),
  status: consentTextStatusSchema.optional()
});

/** A reference template shipped with the seed (`scripts/preprod/seeds/reference/consent-templates.json`). */
export const consentTextTemplateSchema = z.object({
  templateKey: nonEmptyStringSchema,
  purpose: consentPurposeSchema,
  language: languageCodeSchema,
  status: z.literal("draft").default("draft"),
  mode: z.literal("template").default("template"),
  bodyTemplate: nonEmptyStringSchema,
  notes: z.string().optional()
});

export interface AdminConsentTextView {
  id: string;
  purpose: z.output<typeof consentPurposeSchema>;
  countryId: string;
  productId: string | null;
  channel: z.output<typeof consentChannelSchema>;
  recipientCategory: string;
  language: string;
  version: string;
  status: z.output<typeof consentTextStatusSchema>;
  contentHash: string;
  content: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
  /** Id of a more recent published version for the same purpose, country, product and language. */
  supersededBy?: string | null;
  /** Present when the view is requested with `?preview=1`: the content with sample values. */
  preview?: string;
  createdAt: string;
  updatedAt: string;
}

export const consentRecordSchema = z.object({
  id: uuidSchema.optional(),
  consentTextId: uuidSchema,
  subjectReference: nonEmptyStringSchema,
  purpose: z.enum(["lead_transmission", "document_upload", "technical_notification", "ai_processing", "marketing_optional", "service_quality_survey"]),
  countryId: uuidSchema,
  productId: uuidSchema.optional(),
  channel: z.enum(["public_web", "admin", "broker", "api"]),
  intendedRecipient: nonEmptyStringSchema,
  status: z.enum(["granted", "withdrawn", "expired", "anonymized"]).default("granted"),
  grantedAt: dateTimeStringSchema
});

/**
 * Spec 059 follow-up (consent-proof search, compliance_admin / super_admin): at least one criterion
 * among the request reference, the visitor e-mail (fingerprinted server side, never stored or
 * echoed) or the country is required, so the search never dumps every proof.
 */
export const adminConsentRecordSearchQuerySchema = z.object({
  publicReference: z.string().trim().toUpperCase().regex(/^QR-\d{4}-[A-Z0-9]{8}$/).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  countryId: uuidSchema.optional(),
  purpose: consentPurposeSchema.optional(),
  status: z.enum(["granted", "withdrawn", "expired", "anonymized"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
}).refine((value) => Boolean(value.publicReference || value.email || value.countryId), {
  message: "A reference, an e-mail or a country is required"
});
export type AdminConsentRecordSearchQuery = z.input<typeof adminConsentRecordSearchQuerySchema>;

/** One consent proof as the compliance console shows it: the subject fingerprint is truncated. */
export interface AdminConsentRecordView {
  id: string;
  consentTextId: string;
  consentTextVersion: string | null;
  consentTextLanguage: string | null;
  consentTextHash: string | null;
  purpose: z.output<typeof consentPurposeSchema>;
  countryId: string;
  productId: string | null;
  channel: z.output<typeof consentChannelSchema>;
  intendedRecipient: string;
  status: "granted" | "withdrawn" | "expired" | "anonymized";
  grantedAt: string;
  withdrawnAt: string | null;
  retentionUntil: string;
  /** First 8 hexadecimal characters of the e-mail fingerprint, enough to group, not to identify. */
  subjectFingerprint: string;
}

export interface AdminConsentRecordSearchResult {
  items: AdminConsentRecordView[];
  total: number;
  page: number;
  pageSize: number;
}

export const auditLogSchema = z.object({
  id: uuidSchema.optional(),
  actorId: uuidSchema.optional(),
  action: nonEmptyStringSchema,
  targetType: nonEmptyStringSchema,
  targetId: nonEmptyStringSchema,
  scope: z.record(z.string(), z.unknown()).default({}),
  result: z.enum(["success", "refused", "failed"]),
  reason: z.string().optional(),
  context: z.record(z.string(), z.unknown()).default({}),
  correlationId: z.string().optional()
});

export type ConsentTextDto = z.input<typeof consentTextSchema>;
export type AdminConsentTextCreateDto = z.input<typeof adminConsentTextCreateSchema>;
export type AdminConsentTextListQuery = z.input<typeof adminConsentTextListQuerySchema>;
export type ConsentTextTemplate = z.output<typeof consentTextTemplateSchema>;
export type ConsentTextRecord = z.output<typeof consentTextSchema>;
export type ConsentRecordDto = z.input<typeof consentRecordSchema>;
export type ConsentRecordRecord = z.output<typeof consentRecordSchema>;
export type AuditLogDto = z.input<typeof auditLogSchema>;


export const satisfactionSurveySubmitSchema = z.object({
  token: z.string().min(16),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  flaggedConcern: z.boolean().default(false)
});
export type SatisfactionSurveySubmitInput = z.infer<typeof satisfactionSurveySubmitSchema>;

export const satisfactionSurveyStatusResponseSchema = z.object({
  status: z.enum(["available", "submitted", "expired", "unavailable"]),
  publicReference: z.string(),
  locale: z.string().default("fr"),
  rating: z.number().int().min(1).max(5).optional(),
  submittedAt: z.string().optional()
});
export type SatisfactionSurveyStatusResponse = z.infer<typeof satisfactionSurveyStatusResponseSchema>;
