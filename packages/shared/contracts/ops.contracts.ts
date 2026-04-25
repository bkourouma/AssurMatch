import { z } from "zod";
import { nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const notificationSchema = z.object({
  id: uuidSchema.optional(),
  type: z.enum([
    "license_expiration_warning",
    "license_blocked",
    "partner_suspended",
    "feature_flag_changed",
    "critical_job_failed",
    "consent_text_changed",
    "security_admin_change",
    "visitor_quote_confirmation",
    "visitor_quote_non_routable",
    "broker_lead_assigned",
    "quote_notification_failed"
  ]),
  recipientScope: nonEmptyStringSchema,
  whatsAppStatus: z.enum(["pending", "queued", "sent", "delivered", "failed", "retryable"]).default("pending"),
  emailStatus: z.enum(["pending", "queued", "sent", "delivered", "failed", "retryable"]).default("pending"),
  payloadReference: nonEmptyStringSchema
});

export const routingPrecheckRequestSchema = z.object({
  countryId: uuidSchema,
  productId: uuidSchema,
  partnerTenantId: uuidSchema,
  consentRecordId: uuidSchema.optional()
});

export const aiModuleConfigSchema = z.object({
  id: uuidSchema.optional(),
  key: nonEmptyStringSchema,
  status: z.enum(["disabled", "internal_test", "enabled"]).default("disabled"),
  guardrailStatus: z.enum(["not_configured", "configured", "failed_review", "approved"]).default("not_configured"),
  auditPolicy: z.enum(["metadata_only", "full_prompt_metadata", "sensitive_human_validation"]).default("metadata_only"),
  reason: reasonSchema.optional()
});

export type NotificationDto = z.input<typeof notificationSchema>;
export type NotificationRecordDto = z.output<typeof notificationSchema>;
export type RoutingPrecheckRequestDto = z.input<typeof routingPrecheckRequestSchema>;
export type AIModuleConfigDto = z.input<typeof aiModuleConfigSchema>;
export type AIModuleConfigRecord = z.output<typeof aiModuleConfigSchema>;
