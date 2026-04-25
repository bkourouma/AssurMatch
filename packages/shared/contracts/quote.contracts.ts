import { z } from "zod";
import {
  dateTimeStringSchema,
  emailSchema,
  isoCountrySchema,
  nonEmptyStringSchema,
  paginationQuerySchema,
  reasonSchema,
  uuidSchema
} from "../validation/common.schemas";
import { findForbiddenWording } from "./content-safety";

export const quoteFeatureFlags = [
  "public_comparator_enabled",
  "quote_request_enabled",
  "sponsored_offers_enabled",
  "ai_summary_enabled",
  "ai_duplicate_detection_enabled"
] as const;

export const journeyStateSchema = z.object({
  publicEnabled: z.boolean(),
  comparisonEnabled: z.boolean(),
  quoteEnabled: z.boolean(),
  waitlistOnly: z.boolean().default(false)
});

export const publicCountrySchema = z.object({
  id: uuidSchema.optional(),
  isoCode: isoCountrySchema,
  name: nonEmptyStringSchema,
  journeyState: journeyStateSchema
});

export const countryPageResponseSchema = publicCountrySchema.extend({
  technicalRoleNotice: nonEmptyStringSchema
});

export const publicProductSchema = z.object({
  id: uuidSchema.optional(),
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  comparisonEnabled: z.boolean(),
  quoteEnabled: z.boolean()
});

export const productPageResponseSchema = publicProductSchema.extend({
  indicativeNotice: nonEmptyStringSchema
});

export const offerListQuerySchema = z.object({
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  broker: z.string().trim().optional(),
  sort: z.enum(["price_asc", "price_desc", "name_asc", "updated_desc", "sponsored_explicit"]).default("updated_desc")
}).refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, {
  message: "minPrice must be less than or equal to maxPrice"
});

export const offerSummarySchema = z.object({
  id: uuidSchema,
  name: nonEmptyStringSchema,
  brokerName: z.string().optional(),
  indicativePriceMin: z.number().nonnegative().optional(),
  indicativePriceMax: z.number().nonnegative().optional(),
  indicativePriceLabel: nonEmptyStringSchema,
  guaranteeSummary: z.string().optional(),
  isSponsored: z.boolean(),
  sponsorLabel: z.string().optional(),
  disclaimer: nonEmptyStringSchema
});

export const offerDetailSchema = offerSummarySchema.extend({
  validUntil: dateTimeStringSchema,
  publicDisclaimers: z.array(nonEmptyStringSchema).min(1)
});

export const adminOfferUpsertSchema = z.object({
  id: uuidSchema.optional(),
  countryId: uuidSchema,
  productId: uuidSchema,
  partnerTenantId: uuidSchema.optional(),
  publicKey: nonEmptyStringSchema.optional(),
  name: nonEmptyStringSchema,
  shortDescription: z.string().optional(),
  guaranteeSummary: z.string().optional(),
  indicativePriceMin: z.number().nonnegative().optional(),
  indicativePriceMax: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(3).default("XOF"),
  pricingUnit: z.string().optional(),
  validFrom: dateTimeStringSchema,
  validUntil: dateTimeStringSchema,
  isSponsored: z.boolean().default(false),
  sponsorLabel: z.string().optional(),
  publicDisclaimers: z.array(nonEmptyStringSchema).default(["offre indicative", "prix a confirmer par le courtier partenaire"]),
  reason: reasonSchema
}).superRefine((value, ctx) => {
  const publicText = [value.name, value.shortDescription, value.guaranteeSummary, value.sponsorLabel, ...value.publicDisclaimers]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  const forbidden = findForbiddenWording(publicText);
  if (forbidden.length > 0) {
    ctx.addIssue({ code: "custom", message: `Forbidden regulated wording: ${forbidden.join(", ")}` });
  }
  if (new Date(value.validUntil) <= new Date(value.validFrom)) {
    ctx.addIssue({ code: "custom", message: "validUntil must be after validFrom" });
  }
});

export const offerValidationSchema = z.object({
  validationStatus: z.enum(["validated", "rejected"]),
  reason: reasonSchema
});

export const quoteFormFieldSchema = z.object({
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  type: z.enum(["text", "email", "phone", "number", "select", "checkbox", "date"]),
  required: z.boolean(),
  sensitivity: z.enum(["public", "personal", "sensitive"]),
  options: z.array(nonEmptyStringSchema).optional()
});

export const publicConsentTextSchema = z.object({
  consentTextId: uuidSchema,
  version: nonEmptyStringSchema,
  contentHash: nonEmptyStringSchema,
  purpose: z.literal("lead_transmission"),
  recipientCategory: nonEmptyStringSchema
});

export const adminQuoteFormDefinitionSchema = z.object({
  id: uuidSchema.optional(),
  countryId: uuidSchema,
  productId: uuidSchema,
  language: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
  status: z.enum(["draft", "published", "suspended", "retired"]).default("draft"),
  fields: z.array(quoteFormFieldSchema).min(1),
  consentTextId: uuidSchema,
  dataMinimizationNotes: z.string().optional(),
  reason: reasonSchema
});

export const publicQuoteFormResponseSchema = z.object({
  formDefinitionId: uuidSchema,
  version: nonEmptyStringSchema,
  fields: z.array(quoteFormFieldSchema),
  consent: publicConsentTextSchema
});

export const quoteContactSchema = z.object({
  displayName: z.string().trim().optional(),
  email: emailSchema,
  phone: z.string().trim().min(6).max(32)
});

export const quoteRequestCreateSchema = z.object({
  countryCode: isoCountrySchema,
  productKey: nonEmptyStringSchema,
  selectedOfferId: uuidSchema.optional(),
  formDefinitionId: uuidSchema,
  contact: quoteContactSchema,
  answers: z.record(z.string(), z.unknown()).default({}),
  consent: z.object({
    accepted: z.literal(true),
    consentTextId: uuidSchema,
    version: nonEmptyStringSchema,
    contentHash: nonEmptyStringSchema
  }),
  sessionId: z.string().optional(),
  ipAddress: z.string().optional()
});

export const quoteConfirmationSchema = z.object({
  publicReference: nonEmptyStringSchema,
  status: z.enum(["routed", "non_routable", "manual_review", "duplicate"]),
  routed: z.boolean(),
  brokerName: z.string().optional(),
  message: nonEmptyStringSchema,
  verificationToken: nonEmptyStringSchema
});

export const quoteStatusResponseSchema = z.object({
  publicReference: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
  brokerName: z.string().optional()
});

export const brokerLeadSummarySchema = z.object({
  leadAssignmentId: uuidSchema,
  publicReference: nonEmptyStringSchema,
  countryCode: isoCountrySchema,
  productKey: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
  assignedAt: dateTimeStringSchema
});

export const brokerLeadDetailSchema = brokerLeadSummarySchema.extend({
  contact: z.record(z.string(), z.unknown()).default({}),
  answers: z.record(z.string(), z.unknown()).default({}),
  aiSummary: z.string().optional()
});

export const brokerLeadStatusUpdateSchema = z.object({
  status: z.enum(["received", "contacted", "rejected", "closed", "disputed"]),
  reason: reasonSchema
});

export const adminQuoteRequestQuerySchema = paginationQuerySchema.extend({
  countryId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  status: z.string().optional()
});

export const adminReviewStatusUpdateSchema = z.object({
  status: z.enum(["manual_review", "non_routable", "duplicate", "cancelled"]),
  reason: reasonSchema
});

export type JourneyState = z.output<typeof journeyStateSchema>;
export type PublicCountryDto = z.output<typeof publicCountrySchema>;
export type CountryPageResponse = z.output<typeof countryPageResponseSchema>;
export type PublicProductDto = z.output<typeof publicProductSchema>;
export type ProductPageResponse = z.output<typeof productPageResponseSchema>;
export type OfferListQuery = z.output<typeof offerListQuerySchema>;
export type OfferSummary = z.output<typeof offerSummarySchema>;
export type OfferDetail = z.output<typeof offerDetailSchema>;
export type AdminOfferUpsertDto = z.input<typeof adminOfferUpsertSchema>;
export type OfferValidationDto = z.input<typeof offerValidationSchema>;
export type QuoteFormFieldDto = z.output<typeof quoteFormFieldSchema>;
export type AdminQuoteFormDefinitionDto = z.input<typeof adminQuoteFormDefinitionSchema>;
export type PublicQuoteFormResponse = z.output<typeof publicQuoteFormResponseSchema>;
export type QuoteRequestCreateDto = z.input<typeof quoteRequestCreateSchema>;
export type QuoteConfirmation = z.output<typeof quoteConfirmationSchema>;
export type QuoteStatusResponse = z.output<typeof quoteStatusResponseSchema>;
export type BrokerLeadSummary = z.output<typeof brokerLeadSummarySchema>;
export type BrokerLeadDetail = z.output<typeof brokerLeadDetailSchema>;
export type BrokerLeadStatusUpdateDto = z.input<typeof brokerLeadStatusUpdateSchema>;
export type AdminQuoteRequestQuery = z.output<typeof adminQuoteRequestQuerySchema>;
