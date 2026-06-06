import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, paginationQuerySchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const partnerApiScopeSchema = z.enum(["leads:read_assigned", "notifications:read", "webhooks:manage"]);
export const partnerWebhookEventTypeSchema = z.enum(["lead.assigned", "lead.status_changed", "notification.failed"]);
export const partnerApiKeyStatusSchema = z.enum(["active", "revoked"]);
export const partnerWebhookEndpointStatusSchema = z.enum(["disabled", "active", "suspended"]);
export const partnerWebhookDeliveryStatusSchema = z.enum(["skipped", "pending", "retryable", "delivered", "failed", "dead_letter"]);
export const partnerWebhookAllowlistStatusSchema = z.enum(["active", "revoked"]);

export const partnerApiPaginationQuerySchema = paginationQuerySchema;

export const partnerApiKeyCreateSchema = z.object({
  partnerTenantId: uuidSchema,
  name: nonEmptyStringSchema.max(120),
  scopes: z.array(partnerApiScopeSchema).min(1).max(10),
  reason: reasonSchema
});

export const partnerApiKeyRevokeSchema = z.object({
  reason: reasonSchema
});

export const partnerApiKeySummarySchema = z.object({
  id: uuidSchema,
  partnerTenantId: uuidSchema,
  name: nonEmptyStringSchema,
  keyPrefix: nonEmptyStringSchema,
  scopes: z.array(partnerApiScopeSchema),
  status: partnerApiKeyStatusSchema,
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
  lastUsedAt: dateTimeStringSchema.optional(),
  revokedAt: dateTimeStringSchema.optional()
});

export const partnerApiKeyCreateResponseSchema = z.object({
  key: partnerApiKeySummarySchema,
  rawKey: z.string().startsWith("am_pk_"),
  restrictions: z.array(nonEmptyStringSchema)
});

export const partnerApiKeysResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(partnerApiKeySummarySchema),
  total: z.number().int().nonnegative()
});

export const partnerWebhookEndpointCreateSchema = z.object({
  partnerTenantId: uuidSchema,
  url: z.url().refine((value) => value.startsWith("https://"), "Webhook endpoint URL must use HTTPS"),
  description: nonEmptyStringSchema.max(240).optional(),
  eventTypes: z.array(partnerWebhookEventTypeSchema).min(1).max(10),
  reason: reasonSchema
});

export const partnerWebhookAllowlistCreateSchema = z.object({
  partnerTenantId: uuidSchema,
  origin: z.url().refine((value) => value.startsWith("https://"), "Webhook allow-list origin must use HTTPS"),
  path: z.string().trim().startsWith("/").max(240).optional(),
  reason: reasonSchema
});

export const partnerWebhookAllowlistRevokeSchema = z.object({
  reason: reasonSchema
});

export const partnerWebhookAllowlistEntrySchema = z.object({
  id: uuidSchema,
  partnerTenantId: uuidSchema,
  origin: z.url(),
  path: z.string().startsWith("/").optional(),
  status: partnerWebhookAllowlistStatusSchema,
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
  revokedAt: dateTimeStringSchema.optional()
});

export const partnerWebhookAllowlistResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(partnerWebhookAllowlistEntrySchema),
  total: z.number().int().nonnegative()
});

export const partnerWebhookEndpointUpdateSchema = z.object({
  status: partnerWebhookEndpointStatusSchema.optional(),
  eventTypes: z.array(partnerWebhookEventTypeSchema).min(1).max(10).optional(),
  description: nonEmptyStringSchema.max(240).optional(),
  reason: reasonSchema
}).refine((input) => input.status !== undefined || input.eventTypes !== undefined || input.description !== undefined, "At least one endpoint field must change");

export const partnerWebhookEndpointSummarySchema = z.object({
  id: uuidSchema,
  partnerTenantId: uuidSchema,
  url: z.url(),
  description: nonEmptyStringSchema.optional(),
  eventTypes: z.array(partnerWebhookEventTypeSchema),
  status: partnerWebhookEndpointStatusSchema,
  secretConfigured: z.literal(true),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const partnerWebhookEndpointCreateResponseSchema = z.object({
  endpoint: partnerWebhookEndpointSummarySchema,
  signingSecret: z.string().startsWith("whsec_"),
  restrictions: z.array(nonEmptyStringSchema)
});

export const partnerWebhookEndpointsResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(partnerWebhookEndpointSummarySchema),
  total: z.number().int().nonnegative()
});

export const partnerWebhookDeliverySummarySchema = z.object({
  id: uuidSchema,
  endpointId: uuidSchema.optional(),
  partnerTenantId: uuidSchema,
  eventId: nonEmptyStringSchema,
  eventType: partnerWebhookEventTypeSchema,
  status: partnerWebhookDeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: dateTimeStringSchema.optional(),
  lastResponseClass: nonEmptyStringSchema.optional(),
  idempotencyKey: nonEmptyStringSchema,
  payloadMetadata: z.record(z.string(), z.unknown()),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const partnerWebhookDeliveriesResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(partnerWebhookDeliverySummarySchema),
  total: z.number().int().nonnegative()
});

export const partnerApiLeadSummarySchema = z.object({
  id: uuidSchema,
  publicReference: nonEmptyStringSchema,
  countryCode: nonEmptyStringSchema,
  productKey: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
  assignedAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const partnerApiLeadsResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  items: z.array(partnerApiLeadSummarySchema)
});

export const partnerApiNotificationSummarySchema = z.object({
  id: uuidSchema,
  type: nonEmptyStringSchema,
  deliveryStatus: nonEmptyStringSchema,
  payloadReference: nonEmptyStringSchema,
  createdAt: dateTimeStringSchema
});

export const partnerApiNotificationsResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  items: z.array(partnerApiNotificationSummarySchema)
});

export type PartnerApiScope = z.infer<typeof partnerApiScopeSchema>;
export type PartnerWebhookEventType = z.infer<typeof partnerWebhookEventTypeSchema>;
export type PartnerApiKeyStatus = z.infer<typeof partnerApiKeyStatusSchema>;
export type PartnerWebhookEndpointStatus = z.infer<typeof partnerWebhookEndpointStatusSchema>;
export type PartnerWebhookDeliveryStatus = z.infer<typeof partnerWebhookDeliveryStatusSchema>;
export type PartnerWebhookAllowlistStatus = z.infer<typeof partnerWebhookAllowlistStatusSchema>;
export type PartnerApiKeyCreate = z.infer<typeof partnerApiKeyCreateSchema>;
export type PartnerApiKeySummary = z.infer<typeof partnerApiKeySummarySchema>;
export type PartnerApiKeyCreateResponse = z.infer<typeof partnerApiKeyCreateResponseSchema>;
export type PartnerApiKeysResponse = z.infer<typeof partnerApiKeysResponseSchema>;
export type PartnerWebhookEndpointCreate = z.infer<typeof partnerWebhookEndpointCreateSchema>;
export type PartnerWebhookEndpointUpdate = z.infer<typeof partnerWebhookEndpointUpdateSchema>;
export type PartnerWebhookEndpointSummary = z.infer<typeof partnerWebhookEndpointSummarySchema>;
export type PartnerWebhookEndpointCreateResponse = z.infer<typeof partnerWebhookEndpointCreateResponseSchema>;
export type PartnerWebhookEndpointsResponse = z.infer<typeof partnerWebhookEndpointsResponseSchema>;
export type PartnerWebhookAllowlistCreate = z.infer<typeof partnerWebhookAllowlistCreateSchema>;
export type PartnerWebhookAllowlistEntry = z.infer<typeof partnerWebhookAllowlistEntrySchema>;
export type PartnerWebhookAllowlistResponse = z.infer<typeof partnerWebhookAllowlistResponseSchema>;
export type PartnerWebhookDeliverySummary = z.infer<typeof partnerWebhookDeliverySummarySchema>;
export type PartnerWebhookDeliveriesResponse = z.infer<typeof partnerWebhookDeliveriesResponseSchema>;
export type PartnerApiLeadsResponse = z.infer<typeof partnerApiLeadsResponseSchema>;
export type PartnerApiNotificationsResponse = z.infer<typeof partnerApiNotificationsResponseSchema>;
