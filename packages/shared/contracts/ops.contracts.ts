import { z } from "zod";
import { nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

/** Spec 054 R4: visitor e-mails, one per public step, plus the tracking-link resend. */
export const VISITOR_NOTIFICATION_TYPES = [
  "visitor_quote_received",
  "visitor_quote_in_review",
  "visitor_quote_transmitted",
  "visitor_quote_accepted",
  "visitor_quote_reassigned",
  "visitor_quote_closed",
  "visitor_consent_withdrawn",
  "visitor_tracking_link"
] as const;

export type VisitorNotificationType = (typeof VISITOR_NOTIFICATION_TYPES)[number];

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
    "broker_document_received",
    "quote_notification_failed",
    // Spec 054 R4: one notification type per public step of the visitor's request.
    ...VISITOR_NOTIFICATION_TYPES
  ]),
  recipientScope: nonEmptyStringSchema,
  whatsAppStatus: z.enum(["pending", "queued", "sent", "delivered", "failed", "retryable"]).default("pending"),
  emailStatus: z.enum(["pending", "queued", "sent", "delivered", "failed", "retryable"]).default("pending"),
  payloadReference: nonEmptyStringSchema,
  /** Spec 054 R3: persisted idempotency key `{type}:{quoteRequestId}:{assignmentId|-}:{seq}`. */
  dedupeKey: z.string().max(300).optional(),
  /** Spec 054 R3: non-sensitive identifiers of the event (assignment, partner ids), never form answers. */
  eventPayload: z.record(z.string(), z.string()).optional()
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
