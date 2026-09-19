import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

/**
 * Routing modes selectable by an admin (PRD §17). Every mode only ranks partners that the
 * eligibility policy already accepted. `multi_send` fans a request out to several of them and is
 * itself gated by `multi_broker_routing_enabled` plus the visitor's own consent (spec 042);
 * `ai_assisted` remains deliberately absent - AI never decides a routing outcome.
 */
export const routingRuleModes = ["first_eligible", "round_robin", "priority", "capacity", "performance", "exclusive", "manual", "multi_send"] as const;

/** Spec 042 D3: default 3 recipients, hard cap 5. */
export const MULTI_SEND_DEFAULT_RECIPIENTS = 3;
export const MULTI_SEND_MAX_RECIPIENTS = 5;
export const maxRecipientsSchema = z.number().int().min(2).max(MULTI_SEND_MAX_RECIPIENTS);
export const routingRuleModeSchema = z.enum(routingRuleModes);
export const routingRuleStatusSchema = z.enum(["active", "disabled"]);

export const routingRulePrioritySchema = z.object({
  partnerTenantId: uuidSchema,
  priority: z.number().int().min(1).max(1000)
});

export const routingRuleCreateSchema = z.object({
  countryId: uuidSchema,
  productId: uuidSchema.nullable().optional(),
  mode: routingRuleModeSchema,
  maxRecipients: maxRecipientsSchema.default(MULTI_SEND_DEFAULT_RECIPIENTS),
  priorities: z.array(routingRulePrioritySchema).max(50).default([]),
  exclusivePartnerTenantId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(500).optional(),
  reason: nonEmptyStringSchema
});

export const routingRuleUpdateSchema = z.object({
  mode: routingRuleModeSchema.optional(),
  maxRecipients: maxRecipientsSchema.optional(),
  status: routingRuleStatusSchema.optional(),
  priorities: z.array(routingRulePrioritySchema).max(50).optional(),
  exclusivePartnerTenantId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  reason: nonEmptyStringSchema
});

export const routingRuleSchema = z.object({
  id: uuidSchema,
  countryId: uuidSchema,
  productId: uuidSchema.nullable(),
  mode: routingRuleModeSchema,
  maxRecipients: maxRecipientsSchema,
  status: routingRuleStatusSchema,
  priorities: z.array(routingRulePrioritySchema),
  exclusivePartnerTenantId: uuidSchema.nullable(),
  description: z.string().nullable(),
  version: z.number().int().min(1),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
  createdById: z.string().nullable()
});

export const routingRulesResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(routingRuleSchema),
  total: z.number().int().min(0)
});

export const routingRuleHistoryEntrySchema = z.object({
  id: uuidSchema,
  routingRuleId: uuidSchema,
  changeType: z.enum(["created", "updated"]),
  previousValue: z.unknown().nullable(),
  nextValue: z.unknown().nullable(),
  reason: nonEmptyStringSchema,
  changedById: z.string().nullable(),
  changedAt: dateTimeStringSchema
});

export const routingRuleHistoryResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(routingRuleHistoryEntrySchema),
  total: z.number().int().min(0)
});

export const pendingManualQuoteCandidateSchema = z.object({
  partnerTenantId: uuidSchema,
  legalName: nonEmptyStringSchema,
  plan: z.enum(["starter", "pro", "enterprise"]),
  eligible: z.boolean(),
  reasons: z.array(z.string())
});

export const pendingManualQuoteSchema = z.object({
  quoteRequestId: uuidSchema,
  publicReference: nonEmptyStringSchema,
  countryId: uuidSchema,
  countryCode: nonEmptyStringSchema,
  productId: uuidSchema,
  productKey: nonEmptyStringSchema,
  createdAt: dateTimeStringSchema,
  candidates: z.array(pendingManualQuoteCandidateSchema)
});

export const pendingManualQueueResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  items: z.array(pendingManualQuoteSchema),
  total: z.number().int().min(0)
});

export const manualAssignRequestSchema = z.object({
  partnerTenantId: uuidSchema,
  reason: nonEmptyStringSchema
});

export const manualAssignResponseSchema = z.object({
  quoteRequestId: uuidSchema,
  assignmentId: uuidSchema,
  partnerTenantId: uuidSchema,
  status: z.literal("routed")
});

export const leadReassignRequestSchema = z.object({
  partnerTenantId: uuidSchema,
  reason: nonEmptyStringSchema
});

export const leadReassignResponseSchema = z.object({
  assignmentId: uuidSchema,
  quoteRequestId: nonEmptyStringSchema,
  previousPartnerTenantId: uuidSchema,
  partnerTenantId: uuidSchema,
  status: nonEmptyStringSchema,
  assignedAt: dateTimeStringSchema
});

export type RoutingRuleMode = z.infer<typeof routingRuleModeSchema>;
export type RoutingRuleStatus = z.infer<typeof routingRuleStatusSchema>;
export type RoutingRulePriority = z.infer<typeof routingRulePrioritySchema>;
export type RoutingRuleCreate = z.input<typeof routingRuleCreateSchema>;
export type RoutingRuleUpdate = z.input<typeof routingRuleUpdateSchema>;
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export type RoutingRulesResponse = z.infer<typeof routingRulesResponseSchema>;
export type RoutingRuleHistoryEntry = z.infer<typeof routingRuleHistoryEntrySchema>;
export type RoutingRuleHistoryResponse = z.infer<typeof routingRuleHistoryResponseSchema>;
export type PendingManualQuote = z.infer<typeof pendingManualQuoteSchema>;
export type PendingManualQueueResponse = z.infer<typeof pendingManualQueueResponseSchema>;
export type ManualAssignRequest = z.input<typeof manualAssignRequestSchema>;
export type ManualAssignResponse = z.infer<typeof manualAssignResponseSchema>;
export type LeadReassignRequest = z.input<typeof leadReassignRequestSchema>;
export type LeadReassignResponse = z.infer<typeof leadReassignResponseSchema>;
