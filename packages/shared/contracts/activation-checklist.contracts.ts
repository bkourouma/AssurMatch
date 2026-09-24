import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

export const activationChecklistQuerySchema = z.object({
  country: isoCountrySchema.optional(),
  product: nonEmptyStringSchema.optional(),
  partnerId: uuidSchema.optional()
});

export const activationChecklistStatusSchema = z.enum(["passed", "warning", "blocked"]);

export const activationChecklistControlSchema = z.object({
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  status: activationChecklistStatusSchema,
  evidence: nonEmptyStringSchema,
  blocking: z.boolean()
});

export const activationChecklistScopeSchema = z.object({
  countryId: uuidSchema.nullable(),
  countryCode: isoCountrySchema.nullable(),
  productId: uuidSchema.nullable(),
  productKey: nonEmptyStringSchema.nullable(),
  partnerId: uuidSchema.nullable()
});

export const activationChecklistSectionSchema = z.object({
  key: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  status: activationChecklistStatusSchema,
  scope: activationChecklistScopeSchema,
  controls: z.array(activationChecklistControlSchema)
});

export const activationChecklistResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  summary: z.object({
    passed: z.number().int().min(0),
    warning: z.number().int().min(0),
    blocked: z.number().int().min(0)
  }),
  sections: z.array(activationChecklistSectionSchema)
});

export type ActivationChecklistQuery = z.infer<typeof activationChecklistQuerySchema>;
export type ActivationChecklistStatus = z.infer<typeof activationChecklistStatusSchema>;
export type ActivationChecklistControl = z.infer<typeof activationChecklistControlSchema>;
export type ActivationChecklistSection = z.infer<typeof activationChecklistSectionSchema>;
export type ActivationChecklistResponse = z.infer<typeof activationChecklistResponseSchema>;
