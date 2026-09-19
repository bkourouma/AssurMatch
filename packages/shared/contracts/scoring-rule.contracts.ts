import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";
import { scoringCriteria } from "./quote.contracts";

const weightSchema = z.number().int().min(0).max(100);

/** PRD §15 default weights; an admin rule may rebalance them but they always total 100. */
export const DEFAULT_SCORING_WEIGHTS = {
  guaranteeLevel: 30,
  price: 25,
  deductible: 15,
  processingSpeed: 10,
  paymentFlexibility: 10,
  informationQuality: 5,
  userPreferences: 5
} as const;

export const scoringWeightsSchema = z.object({
  guaranteeLevel: weightSchema,
  price: weightSchema,
  deductible: weightSchema,
  processingSpeed: weightSchema,
  paymentFlexibility: weightSchema,
  informationQuality: weightSchema,
  userPreferences: weightSchema
}).refine((weights) => scoringCriteria.reduce((sum, criterion) => sum + weights[criterion], 0) === 100, {
  message: "Invalid scoring rule: weights_must_total_100"
});

export const scoringRuleStatusSchema = z.enum(["active", "disabled"]);

export const scoringRuleCreateSchema = z.object({
  countryId: uuidSchema.nullable().optional(),
  productId: uuidSchema.nullable().optional(),
  weights: scoringWeightsSchema,
  description: z.string().trim().max(500).optional(),
  reason: nonEmptyStringSchema
});

export const scoringRuleUpdateSchema = z.object({
  weights: scoringWeightsSchema.optional(),
  status: scoringRuleStatusSchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  reason: nonEmptyStringSchema
});

export const scoringRuleSchema = z.object({
  id: uuidSchema,
  countryId: uuidSchema.nullable(),
  productId: uuidSchema.nullable(),
  weights: scoringWeightsSchema,
  status: scoringRuleStatusSchema,
  description: z.string().nullable(),
  version: z.number().int().min(1),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
  createdById: z.string().nullable()
});

export const scoringRulesResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  defaults: scoringWeightsSchema,
  items: z.array(scoringRuleSchema),
  total: z.number().int().min(0)
});

export type ScoringWeights = z.output<typeof scoringWeightsSchema>;
export type ScoringRuleStatus = z.output<typeof scoringRuleStatusSchema>;
export type ScoringRuleCreate = z.input<typeof scoringRuleCreateSchema>;
export type ScoringRuleUpdate = z.input<typeof scoringRuleUpdateSchema>;
export type ScoringRule = z.output<typeof scoringRuleSchema>;
export type ScoringRulesResponse = z.output<typeof scoringRulesResponseSchema>;
