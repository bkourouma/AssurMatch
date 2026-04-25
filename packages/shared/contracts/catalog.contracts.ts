import { z } from "zod";
import { isoCountrySchema, languageCodeSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const COUNTRY_FEATURE_FLAG_DEFAULTS = {
  country_public_enabled: false,
  country_waitlist_enabled: false,
  country_quote_enabled: false,
  country_comparison_enabled: false,
  country_broker_onboarding_enabled: false,
  country_ai_enabled: false
} as const;

export const PRODUCT_FEATURE_FLAG_DEFAULTS = {
  product_public_enabled: false,
  product_quote_enabled: false,
  product_comparison_enabled: false,
  product_document_upload_enabled: false,
  product_sensitive_data_enabled: false,
  product_manual_review_required: true,
  product_ai_scoring_enabled: false,
  product_ai_form_assistant_enabled: false
} as const;

export const countryFlagsSchema = z.object({
  country_public_enabled: z.boolean().default(false),
  country_waitlist_enabled: z.boolean().default(false),
  country_quote_enabled: z.boolean().default(false),
  country_comparison_enabled: z.boolean().default(false),
  country_broker_onboarding_enabled: z.boolean().default(false),
  country_ai_enabled: z.boolean().default(false)
});

export const productFlagsSchema = z.object({
  product_public_enabled: z.boolean().default(false),
  product_quote_enabled: z.boolean().default(false),
  product_comparison_enabled: z.boolean().default(false),
  product_document_upload_enabled: z.boolean().default(false),
  product_sensitive_data_enabled: z.boolean().default(false),
  product_manual_review_required: z.boolean().default(true),
  product_ai_scoring_enabled: z.boolean().default(false),
  product_ai_form_assistant_enabled: z.boolean().default(false)
});

export const regulatoryRegimeSchema = z.object({
  id: uuidSchema.optional(),
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  description: z.string().optional(),
  retentionOverrideYears: z.number().int().min(1).max(30).optional(),
  requiresManualActivationReview: z.boolean().default(false),
  status: z.enum(["draft", "active", "suspended", "retired"]).default("draft")
});

export const countryCreateSchema = z.object({
  id: uuidSchema.optional(),
  isoCode: isoCountrySchema,
  name: nonEmptyStringSchema,
  currency: z.string().min(3).max(3),
  languages: z.array(languageCodeSchema).min(1),
  timezone: nonEmptyStringSchema,
  regulatoryFamily: z.enum(["cima", "fanaf", "outside_cima", "future"]),
  regulatoryRegimeId: uuidSchema.optional(),
  status: z.enum(["draft", "internal", "partner_test", "pilot", "public", "suspended", "retired"]).default("draft"),
  flags: countryFlagsSchema.default(COUNTRY_FEATURE_FLAG_DEFAULTS)
});

export const countryUpdateSchema = countryCreateSchema.partial().extend({
  reason: reasonSchema
});

export const productCreateSchema = z.object({
  id: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  description: z.string().optional(),
  sensitivity: z.enum(["standard", "sensitive", "highly_sensitive"]).default("standard"),
  requiresDocuments: z.boolean().default(false),
  requiresManualReview: z.boolean().default(true),
  status: z.enum(["draft", "internal", "pilot", "public", "suspended", "retired"]).default("draft"),
  flags: productFlagsSchema.default(PRODUCT_FEATURE_FLAG_DEFAULTS)
});

export const productUpdateSchema = productCreateSchema.partial().extend({
  reason: reasonSchema
});

export type CountryFlags = z.output<typeof countryFlagsSchema>;
export type ProductFlags = z.output<typeof productFlagsSchema>;
export type RegulatoryRegimeDto = z.input<typeof regulatoryRegimeSchema>;
export type RegulatoryRegimeRecord = z.output<typeof regulatoryRegimeSchema>;
export type CountryDto = z.input<typeof countryCreateSchema>;
export type CountryRecord = z.output<typeof countryCreateSchema>;
export type ProductDto = z.input<typeof productCreateSchema>;
export type ProductRecord = z.output<typeof productCreateSchema>;
