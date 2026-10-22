import { z } from "zod";
import { dateTimeStringSchema, uuidSchema } from "../validation/common.schemas";
import { billingPlanKeySchema } from "./billing.contracts";

/**
 * Lot 5 (spec 071), PRD v0.3 G-06: the broker owner requests a plan change (no online payment); an admin
 * accepts or refuses it (audited). An accepted change takes billing effect on the first day of the next
 * monthly cycle: the draft of that cycle is priced with the new plan.
 */
export const planChangeRequestStatusSchema = z.enum(["pending", "accepted", "refused", "cancelled"]);
export type PlanChangeRequestStatus = z.infer<typeof planChangeRequestStatusSchema>;

export const planChangeRequestSchema = z.object({
  id: uuidSchema,
  partnerId: uuidSchema,
  partnerName: z.string().nullable(),
  currentPlan: billingPlanKeySchema,
  requestedPlan: billingPlanKeySchema,
  status: planChangeRequestStatusSchema,
  justification: z.string(),
  requestedAt: dateTimeStringSchema,
  decidedAt: dateTimeStringSchema.nullable(),
  decisionReason: z.string().nullable(),
  /** First day (UTC) of the cycle the accepted change applies from; null until accepted. */
  effectiveAt: dateTimeStringSchema.nullable()
});

export const planChangeRequestCreateSchema = z.object({
  requestedPlan: billingPlanKeySchema,
  justification: z.string().trim().min(10).max(500)
});

export const planChangeDecisionSchema = z.object({
  decision: z.enum(["accept", "refuse"]),
  reason: z.string().trim().min(3).max(500)
});

export const planChangeRequestQuerySchema = z.object({
  status: planChangeRequestStatusSchema.optional(),
  partnerId: uuidSchema.optional()
});

export const planChangeRequestListSchema = z.object({
  items: z.array(planChangeRequestSchema),
  total: z.number().int().min(0)
});

export type PlanChangeRequest = z.infer<typeof planChangeRequestSchema>;
export type PlanChangeRequestCreate = z.input<typeof planChangeRequestCreateSchema>;
export type PlanChangeDecision = z.input<typeof planChangeDecisionSchema>;
