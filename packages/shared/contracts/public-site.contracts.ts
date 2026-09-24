import { z } from "zod";
import {
  dateStringSchema,
  dateTimeStringSchema,
  e164PhoneSchema,
  emailSchema,
  isoCountrySchema,
  languageCodeSchema,
  nonEmptyStringSchema,
  uuidSchema
} from "../validation/common.schemas";
import { billingPlanKeySchema } from "./billing.contracts";

/** Who is writing to AssurMatch: the contact form routes and audits by audience. */
export const contactAudienceSchema = z.enum(["visitor", "broker", "insurer", "press"]);

/**
 * Fields every public POST carries for abuse control. `website` is a honeypot: a real visitor
 * never fills it, so a non-empty value is refused by `PublicAbuseGuardService`. The `max(0)`
 * keeps the inferred type `string | undefined` for the front-end form state.
 */
export const publicSubmissionGuardFieldsSchema = z.object({
  website: z.string().max(0).optional(),
  sessionId: z.string().max(128).optional()
});

export const waitlistSubscribeSchema = z.object({
  countryCode: isoCountrySchema,
  email: emailSchema,
  productKey: nonEmptyStringSchema.optional(),
  consent: z.literal(true)
}).extend(publicSubmissionGuardFieldsSchema.shape);

export const waitlistSubscribeResponseSchema = z.object({
  status: z.literal("accepted"),
  countryCode: isoCountrySchema,
  message: nonEmptyStringSchema
});

export const contactMessageCreateSchema = z.object({
  audience: contactAudienceSchema,
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: e164PhoneSchema.optional(),
  countryCode: isoCountrySchema.optional(),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(4000),
  consent: z.literal(true)
}).extend(publicSubmissionGuardFieldsSchema.shape);

export const contactMessageResponseSchema = z.object({
  status: z.literal("received"),
  publicReference: nonEmptyStringSchema,
  message: nonEmptyStringSchema
});

/** How far a country has opened: `waitlist` collects emails only, `pilot` is partner-limited. */
export const publicCountryAvailabilitySchema = z.enum(["open", "pilot", "waitlist"]);

export const publicCountryDirectoryItemSchema = z.object({
  isoCode: isoCountrySchema,
  name: nonEmptyStringSchema,
  currency: nonEmptyStringSchema,
  languages: z.array(languageCodeSchema),
  availability: publicCountryAvailabilitySchema,
  comparisonEnabled: z.boolean(),
  quoteEnabled: z.boolean()
});

/**
 * Homepage counters. `indicative` is pinned to `true` so no caller can present these numbers as
 * audited figures (constitution I: AssurMatch stays a technical platform).
 */
export const publicStatsSchema = z.object({
  openCountries: z.number().int().nonnegative(),
  activeBrokers: z.number().int().nonnegative(),
  validatedOffers: z.number().int().nonnegative(),
  computedAt: dateTimeStringSchema,
  indicative: z.literal(true)
});

export const publicPartnerSummarySchema = z.object({
  id: uuidSchema,
  displayName: nonEmptyStringSchema,
  city: z.string().nullable().optional(),
  licenseNumber: nonEmptyStringSchema,
  issuingAuthority: nonEmptyStringSchema,
  licenseExpiresAt: dateStringSchema,
  productKeys: z.array(nonEmptyStringSchema)
});

export const publicPartnerProductSchema = z.object({
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema
});

export const publicPartnerDetailSchema = publicPartnerSummarySchema.extend({
  products: z.array(publicPartnerProductSchema),
  disclaimer: nonEmptyStringSchema
});

export const publicInsurerSummarySchema = z.object({
  insurerName: nonEmptyStringSchema,
  offerCount: z.number().int().nonnegative(),
  productKeys: z.array(nonEmptyStringSchema)
});

export const publicPlanPriceSchema = z.object({
  plan: billingPlanKeySchema,
  monthlySubscription: z.number().nonnegative(),
  perLeadPrice: z.number().nonnegative(),
  setupFee: z.number().nonnegative(),
  currency: nonEmptyStringSchema
});

export const publicPlansResponseSchema = z.object({
  items: z.array(publicPlanPriceSchema),
  notice: nonEmptyStringSchema
});

export const consentWithdrawalResponseSchema = z.object({
  status: z.literal("cancelled"),
  publicReference: nonEmptyStringSchema,
  alreadyWithdrawn: z.boolean(),
  message: nonEmptyStringSchema
});

export type ContactAudience = z.output<typeof contactAudienceSchema>;
export type PublicSubmissionGuardFields = z.output<typeof publicSubmissionGuardFieldsSchema>;
export type WaitlistSubscribeDto = z.input<typeof waitlistSubscribeSchema>;
export type WaitlistSubscribeInput = z.output<typeof waitlistSubscribeSchema>;
export type WaitlistSubscribeResponse = z.output<typeof waitlistSubscribeResponseSchema>;
export type ContactMessageCreateDto = z.input<typeof contactMessageCreateSchema>;
export type ContactMessageCreateInput = z.output<typeof contactMessageCreateSchema>;
export type ContactMessageResponse = z.output<typeof contactMessageResponseSchema>;
export type PublicCountryAvailability = z.output<typeof publicCountryAvailabilitySchema>;
export type PublicCountryDirectoryItem = z.output<typeof publicCountryDirectoryItemSchema>;
export type PublicStats = z.output<typeof publicStatsSchema>;
export type PublicPartnerSummary = z.output<typeof publicPartnerSummarySchema>;
export type PublicPartnerProduct = z.output<typeof publicPartnerProductSchema>;
export type PublicPartnerDetail = z.output<typeof publicPartnerDetailSchema>;
export type PublicInsurerSummary = z.output<typeof publicInsurerSummarySchema>;
export type PublicPlanPrice = z.output<typeof publicPlanPriceSchema>;
export type PublicPlansResponse = z.output<typeof publicPlansResponseSchema>;
export type ConsentWithdrawalResponse = z.output<typeof consentWithdrawalResponseSchema>;
