import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isoCountrySchema = z.string().min(2).max(3).transform((value) => value.toUpperCase());
export const languageCodeSchema = z.string().min(2).max(8);
export const e164PhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
export const emailSchema = z.string().email().transform((value) => value.toLowerCase());
export const nonEmptyStringSchema = z.string().trim().min(1);
export const reasonSchema = z.string().trim().min(8, "A reason is required for sensitive changes");
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dateTimeStringSchema = z.string().datetime();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export const scopeSchema = z.object({
  countryIds: z.array(uuidSchema).default([]),
  productIds: z.array(uuidSchema).default([]),
  partnerTenantId: uuidSchema.optional(),
  plan: z.string().optional()
}).default({ countryIds: [], productIds: [] });

export const statusChangeSchema = z.object({
  status: nonEmptyStringSchema,
  reason: reasonSchema
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type Scope = z.infer<typeof scopeSchema>;
