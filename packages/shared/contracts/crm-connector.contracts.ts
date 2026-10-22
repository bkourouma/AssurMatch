import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

/** Spec 076: subset of the partner webhook catalogue (spec 039) that the outbound CRM connector forwards. */
export const CRM_EVENT_TYPES = ["lead.assigned", "lead.status_changed"] as const;

export const crmEventTypeSchema = z.enum(CRM_EVENT_TYPES);
export const crmConnectorStatusSchema = z.enum(["disabled", "active", "suspended"]);
export const crmConnectorDeliveryStatusSchema = z.enum(["pending", "retryable", "delivered", "failed", "dead_letter"]);

const RESERVED_HEADER_NAMES = new Set(["host", "content-length", "content-type", "user-agent"]);

export const crmAuthHeaderNameSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/, "Invalid CRM auth header name")
  .refine((name) => {
    const lower = name.toLowerCase();
    return !RESERVED_HEADER_NAMES.has(lower) && !lower.startsWith("x-assurmatch-");
  }, "CRM auth header name is reserved");

const crmUrlSchema = z.url().refine((value) => value.startsWith("https://"), "CRM connector URL must use HTTPS");
const crmEventTypesSchema = z.array(crmEventTypeSchema).min(1).max(2);
const crmAuthHeaderValueSchema = z.string().min(1).max(512).regex(/^[^\r\n]+$/, "CRM auth header value must be a single line");

export const crmConnectorCreateSchema = z
  .object({
    partnerTenantId: uuidSchema,
    name: nonEmptyStringSchema.max(120),
    url: crmUrlSchema,
    eventTypes: crmEventTypesSchema,
    authHeaderName: crmAuthHeaderNameSchema.optional(),
    authHeaderValue: crmAuthHeaderValueSchema.optional(),
    reason: reasonSchema
  })
  .refine((value) => (value.authHeaderName === undefined) === (value.authHeaderValue === undefined), {
    message: "authHeaderName and authHeaderValue must be provided together",
    path: ["authHeaderValue"]
  });

export const crmConnectorUpdateSchema = z
  .object({
    status: crmConnectorStatusSchema.optional(),
    eventTypes: crmEventTypesSchema.optional(),
    url: crmUrlSchema.optional(),
    name: nonEmptyStringSchema.max(120).optional(),
    authHeaderName: crmAuthHeaderNameSchema.optional(),
    authHeaderValue: crmAuthHeaderValueSchema.optional(),
    rotateSecret: z.boolean().optional(),
    reason: reasonSchema
  })
  .refine(
    (value) => Object.entries(value).some(([key, entry]) => key !== "reason" && entry !== undefined && entry !== false),
    { message: "At least one change is required", path: ["status"] }
  );

/** Connector summary: never carries the signing secret nor the auth header value. */
export const crmConnectorSummarySchema = z.object({
  id: uuidSchema,
  partnerTenantId: uuidSchema,
  name: nonEmptyStringSchema,
  urlHost: nonEmptyStringSchema,
  url: nonEmptyStringSchema,
  eventTypes: z.array(crmEventTypeSchema),
  status: crmConnectorStatusSchema,
  authHeaderName: z.string().nullable(),
  authHeaderConfigured: z.boolean(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const crmConnectorsResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(crmConnectorSummarySchema),
  total: z.number().int().nonnegative()
});

/** `signingSecret` is returned once, on creation or rotation. */
export const crmConnectorMutationResponseSchema = z.object({
  connector: crmConnectorSummarySchema,
  signingSecret: z.string().startsWith("crmsec_").optional(),
  restrictions: z.array(z.string()).optional()
});

export const crmConnectorDeliverySummarySchema = z.object({
  id: uuidSchema,
  connectorId: uuidSchema,
  eventType: crmEventTypeSchema,
  status: crmConnectorDeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: dateTimeStringSchema.nullable(),
  lastResponseClass: z.string().nullable(),
  payloadMetadata: z.record(z.string(), z.unknown()),
  createdAt: dateTimeStringSchema
});

export const crmConnectorDeliveriesResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(crmConnectorDeliverySummarySchema),
  total: z.number().int().nonnegative()
});

export type CrmEventType = z.infer<typeof crmEventTypeSchema>;
export type CrmConnectorStatus = z.infer<typeof crmConnectorStatusSchema>;
export type CrmConnectorDeliveryStatus = z.infer<typeof crmConnectorDeliveryStatusSchema>;
export type CrmConnectorCreate = z.infer<typeof crmConnectorCreateSchema>;
export type CrmConnectorUpdate = z.infer<typeof crmConnectorUpdateSchema>;
export type CrmConnectorSummary = z.infer<typeof crmConnectorSummarySchema>;
export type CrmConnectorsResponse = z.infer<typeof crmConnectorsResponseSchema>;
export type CrmConnectorMutationResponse = z.infer<typeof crmConnectorMutationResponseSchema>;
export type CrmConnectorDeliverySummary = z.infer<typeof crmConnectorDeliverySummarySchema>;
export type CrmConnectorDeliveriesResponse = z.infer<typeof crmConnectorDeliveriesResponseSchema>;
