import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, languageCodeSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";
import { toPatchSchema } from "../validation/patch.schemas";

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

export const countryStatusSchema = z.enum(["draft", "internal", "partner_test", "pilot", "public", "suspended", "retired"]);
export const productStatusSchema = z.enum(["draft", "internal", "pilot", "public", "suspended", "retired"]);
export const countryProductLinkStatusSchema = z.enum(["internal", "pilot", "public", "suspended", "retired"]);
export const regulatoryRegimeStatusSchema = z.enum(["draft", "active", "suspended", "retired"]);
export const phoneDialCodeSchema = z.string().regex(/^\+\d{1,4}$/, "Dial code must be + followed by 1 to 4 digits");

export const regulatoryRegimeSchema = z.object({
  id: uuidSchema.optional(),
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  description: z.string().optional(),
  retentionOverrideYears: z.number().int().min(1).max(30).optional(),
  requiresManualActivationReview: z.boolean().default(false),
  status: regulatoryRegimeStatusSchema.default("draft")
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
  /** Spec 050 R8: international dialling code, for example `+225`. Absent: generic normalisation. */
  phoneDialCode: phoneDialCodeSchema.optional(),
  /** Spec 050 R8: accepted national number lengths, for example `[10]`. Absent or empty: generic normalisation. */
  phoneNationalLengths: z.array(z.number().int().min(6).max(12)).max(4).optional(),
  status: countryStatusSchema.default("draft"),
  flags: countryFlagsSchema.default(COUNTRY_FEATURE_FLAG_DEFAULTS)
});

export const countryFlagsPatchSchema = toPatchSchema(countryFlagsSchema);

export const countryUpdateSchema = toPatchSchema(countryCreateSchema).omit({ id: true }).extend({
  flags: countryFlagsPatchSchema.optional(),
  /** Spec 050 R10: optimistic concurrency token; a stale value is refused with 409. */
  expectedUpdatedAt: dateTimeStringSchema.optional(),
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
  status: productStatusSchema.default("draft"),
  flags: productFlagsSchema.default(PRODUCT_FEATURE_FLAG_DEFAULTS)
});

export const productFlagsPatchSchema = toPatchSchema(productFlagsSchema);

export const productUpdateSchema = toPatchSchema(productCreateSchema).omit({ id: true }).extend({
  flags: productFlagsPatchSchema.optional(),
  /** Spec 050 R10: optimistic concurrency token; a stale value is refused with 409. */
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: reasonSchema
});

/* ---------------------------------------------------------------------------------------------
 * Spec 050: admin catalogue contracts. Flags and status never travel through a PATCH: they have
 * their own audited endpoints, so activation conditions cannot be bypassed by an edit.
 * ------------------------------------------------------------------------------------------- */

/** R3: the only country flags the catalogue screens may toggle. AI and sensitive flags are excluded. */
export const COUNTRY_CATALOG_TOGGLEABLE_FLAGS = [
  "country_public_enabled",
  "country_waitlist_enabled",
  "country_quote_enabled",
  "country_comparison_enabled",
  "country_broker_onboarding_enabled"
] as const;

/** R3: the only product flags (global or per country link) the catalogue screens may toggle. */
export const PRODUCT_CATALOG_TOGGLEABLE_FLAGS = [
  "product_public_enabled",
  "product_quote_enabled",
  "product_comparison_enabled",
  "product_document_upload_enabled",
  "product_manual_review_required"
] as const;

export type CountryCatalogToggleableFlag = (typeof COUNTRY_CATALOG_TOGGLEABLE_FLAGS)[number];
export type ProductCatalogToggleableFlag = (typeof PRODUCT_CATALOG_TOGGLEABLE_FLAGS)[number];

/** R2: flags written on a link created from the admin screen; everything closed, manual review on. */
export const COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS = {
  product_public_enabled: false,
  product_quote_enabled: false,
  product_comparison_enabled: false,
  product_document_upload_enabled: false,
  product_manual_review_required: true
} as const;

export const catalogActionReasonSchema = z.object({ reason: reasonSchema });

export const catalogFlagToggleSchema = z.object({
  key: nonEmptyStringSchema,
  value: z.boolean(),
  reason: reasonSchema
});

export const countryStatusChangeSchema = z.object({
  status: countryStatusSchema,
  reason: reasonSchema
});

export const countryProductLinkCreateSchema = z.object({
  productId: uuidSchema,
  reason: reasonSchema
});

export const adminCountryCreateSchema = countryCreateSchema.omit({ id: true, status: true, flags: true }).extend({
  reason: reasonSchema
});

export const adminCountryUpdateSchema = toPatchSchema(countryCreateSchema).omit({ id: true, isoCode: true, status: true, flags: true }).extend({
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: reasonSchema
});

export const adminProductCreateSchema = productCreateSchema.omit({ id: true, status: true, flags: true }).extend({
  reason: reasonSchema
});

export const adminProductUpdateSchema = toPatchSchema(productCreateSchema).omit({ id: true, key: true, flags: true }).extend({
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: reasonSchema
});

export const adminProductListQuerySchema = z.object({ countryId: uuidSchema.optional() });

export const adminRegulatoryRegimeCreateSchema = regulatoryRegimeSchema.omit({ id: true }).extend({
  status: regulatoryRegimeStatusSchema.exclude(["retired"]).default("draft"),
  reason: reasonSchema
});

export const regulatoryRegimeUpdateSchema = toPatchSchema(regulatoryRegimeSchema).omit({ id: true, key: true }).extend({
  /** Retiring goes through the dedicated endpoint, which checks the referencing countries. */
  status: regulatoryRegimeStatusSchema.exclude(["retired"]).optional(),
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: reasonSchema
});

export interface AdminCountryProductLinkView {
  countryId: string;
  productId: string;
  productKey: string;
  productName: string;
  status: z.output<typeof countryProductLinkStatusSchema>;
  /** Flags stored on the link; an absent key inherits the product flag (R2). */
  flags: Partial<ProductFlags>;
  /** Product flag AND link flag, as read by the public journey. */
  effectiveFlags: ProductFlags;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCatalogChecklistSummary {
  /** True when no blocking activation control fails for the country. */
  ready: boolean;
  blockers: CatalogActivationBlocker[];
}

export interface CatalogActivationBlocker {
  section: string;
  control: string;
  label: string;
  evidence: string;
}

export interface AdminCountryView {
  id: string;
  isoCode: string;
  name: string;
  currency: string;
  languages: string[];
  timezone: string;
  regulatoryFamily: CountryRecord["regulatoryFamily"];
  regulatoryRegimeId: string | null;
  phoneDialCode: string | null;
  phoneNationalLengths: number[];
  status: CountryRecord["status"];
  flags: CountryFlags;
  publicSince: string | null;
  createdAt: string;
  updatedAt: string;
  links?: AdminCountryProductLinkView[];
  checklist?: AdminCatalogChecklistSummary;
}

export interface AdminProductView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  sensitivity: ProductRecord["sensitivity"];
  requiresDocuments: boolean;
  requiresManualReview: boolean;
  status: ProductRecord["status"];
  flags: ProductFlags;
  countryIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminRegulatoryRegimeView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  retentionOverrideYears: number | null;
  requiresManualActivationReview: boolean;
  status: RegulatoryRegimeRecord["status"];
  createdAt: string;
  updatedAt: string;
}

export type CountryFlags = z.output<typeof countryFlagsSchema>;
export type ProductFlags = z.output<typeof productFlagsSchema>;
export type RegulatoryRegimeDto = z.input<typeof regulatoryRegimeSchema>;
export type RegulatoryRegimeRecord = z.output<typeof regulatoryRegimeSchema>;
export type CountryFlagsPatch = z.output<typeof countryFlagsPatchSchema>;
export type ProductFlagsPatch = z.output<typeof productFlagsPatchSchema>;
export type CountryDto = z.input<typeof countryCreateSchema>;
export type CountryRecord = z.output<typeof countryCreateSchema>;
export type CountryUpdateDto = z.input<typeof countryUpdateSchema>;
export type ProductDto = z.input<typeof productCreateSchema>;
export type ProductRecord = z.output<typeof productCreateSchema>;
export type ProductUpdateDto = z.input<typeof productUpdateSchema>;
export type CountryStatus = z.output<typeof countryStatusSchema>;
export type ProductStatus = z.output<typeof productStatusSchema>;
export type CountryProductLinkStatus = z.output<typeof countryProductLinkStatusSchema>;
export type CatalogFlagToggleDto = z.input<typeof catalogFlagToggleSchema>;
export type CountryStatusChangeDto = z.input<typeof countryStatusChangeSchema>;
export type CountryProductLinkCreateDto = z.input<typeof countryProductLinkCreateSchema>;
export type AdminCountryCreateDto = z.input<typeof adminCountryCreateSchema>;
export type AdminCountryUpdateDto = z.input<typeof adminCountryUpdateSchema>;
export type AdminProductCreateDto = z.input<typeof adminProductCreateSchema>;
export type AdminProductUpdateDto = z.input<typeof adminProductUpdateSchema>;
export type AdminRegulatoryRegimeCreateDto = z.input<typeof adminRegulatoryRegimeCreateSchema>;
export type RegulatoryRegimeUpdateDto = z.input<typeof regulatoryRegimeUpdateSchema>;
