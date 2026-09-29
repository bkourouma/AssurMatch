import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

export const consentTextSchema = z.object({
  id: uuidSchema.optional(),
  purpose: z.enum(["lead_transmission", "document_upload", "technical_notification", "ai_processing", "marketing_optional", "service_quality_survey"]),
  countryId: uuidSchema,
  productId: uuidSchema.optional(),
  channel: z.enum(["public_web", "admin", "broker", "api"]),
  recipientCategory: nonEmptyStringSchema,
  language: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
  status: z.enum(["draft", "review", "published", "retired"]).default("draft"),
  contentHash: nonEmptyStringSchema
});

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
