import { z } from "zod";
import { nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const featureFlagSchema = z.object({
  id: uuidSchema.optional(),
  key: nonEmptyStringSchema,
  scopeType: z.enum(["global", "country", "product", "partner", "plan", "module", "ai"]),
  scopeId: z.string().optional(),
  value: z.boolean().default(false),
  defaultValue: z.boolean().default(false),
  reason: reasonSchema,
  cacheVersion: z.number().int().min(1).default(1)
});

export const featureFlagUpdateSchema = z.object({
  value: z.boolean(),
  reason: reasonSchema
});

export type FeatureFlagDto = z.input<typeof featureFlagSchema>;
