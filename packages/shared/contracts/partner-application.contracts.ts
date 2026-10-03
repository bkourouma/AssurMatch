import { z } from "zod";
import {
  dateStringSchema,
  dateTimeStringSchema,
  e164PhoneSchema,
  emailSchema,
  isoCountrySchema,
  nonEmptyStringSchema,
  reasonSchema,
  uuidSchema
} from "../validation/common.schemas";
import { billingPlanKeySchema } from "./billing.contracts";
import { publicLocaleSchema, publicSubmissionGuardFieldsSchema } from "./public-site.contracts";

export const partnerApplicationStatusSchema = z.enum(["received", "under_review", "accepted", "rejected"]);

/** Spec 051 R10: closed list of rejection reasons (the internal note is never e-mailed). */
export const partnerApplicationRejectionReasonCodeSchema = z.enum([
  "license_unverifiable",
  "out_of_coverage",
  "incomplete_information",
  "insufficient_capacity",
  "other"
]);

/**
 * A broker applying from the public site. Nothing here activates a partner: an application is
 * evidence of intent that compliance reviews before any PartnerTenant exists (constitution II).
 */
export const partnerApplicationCreateSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().max(160).optional(),
  countryCode: isoCountrySchema,
  licenseNumber: z.string().trim().min(3).max(64),
  licenseExpiresAt: dateStringSchema.refine(
    (value) => Date.parse(`${value}T00:00:00.000Z`) > Date.now(),
    { message: "licenseExpiresAt must be strictly in the future" }
  ),
  licenseIssuingAuthority: z.string().trim().max(160).optional(),
  productKeys: z.array(nonEmptyStringSchema).min(1).max(10),
  monthlyCapacity: z.number().int().min(1).max(10_000),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: emailSchema,
  contactPhone: e164PhoneSchema,
  whatsapp: e164PhoneSchema.optional(),
  desiredPlan: billingPlanKeySchema,
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true),
  locale: publicLocaleSchema.optional()
}).extend(publicSubmissionGuardFieldsSchema.shape);

export const partnerApplicationResponseSchema = z.object({
  status: z.literal("received"),
  publicReference: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  nextSteps: z.array(nonEmptyStringSchema)
});

/**
 * Back-office view of a stored application. The raw contact e-mail is deliberately absent: only
 * the normalized value and its fingerprint live in the database, and neither is exposed here.
 */
export const adminPartnerApplicationSchema = z.object({
  id: uuidSchema,
  publicReference: nonEmptyStringSchema,
  countryId: uuidSchema,
  legalName: nonEmptyStringSchema,
  tradeName: z.string().optional(),
  licenseNumber: nonEmptyStringSchema,
  licenseIssuingAuthority: z.string().optional(),
  licenseExpiresAt: dateTimeStringSchema,
  productIds: z.array(uuidSchema),
  monthlyCapacity: z.number().int().min(0),
  contactName: nonEmptyStringSchema,
  contactPhone: nonEmptyStringSchema,
  whatsapp: z.string().optional(),
  desiredPlan: billingPlanKeySchema,
  message: z.string().optional(),
  status: partnerApplicationStatusSchema,
  reviewedById: uuidSchema.optional(),
  reviewedAt: dateTimeStringSchema.optional(),
  reviewNote: z.string().optional(),
  partnerTenantId: uuidSchema.optional(),
  /** Spec 051 R10: decision fields. `accepted` means converted (`partnerTenantId` is then set). */
  rejectionReasonCode: partnerApplicationRejectionReasonCodeSchema.optional(),
  decidedAt: dateTimeStringSchema.optional(),
  /** Language of the application (defaults to `fr` for applications stored before spec 051). */
  locale: publicLocaleSchema.optional(),
  /** Spec 051: the full contact e-mail, only for the roles that decide (compliance_admin, super_admin). */
  contactEmail: z.string().optional(),
  createdAt: dateTimeStringSchema
});

/** Spec 051: POST /admin/partners/applications/:id/review (received -> under_review). */
export const partnerApplicationReviewSchema = z.object({ reason: reasonSchema });
/** Spec 051: POST /admin/partners/applications/:id/convert. */
export const partnerApplicationConvertSchema = z.object({ reason: reasonSchema });
/** Spec 051: POST /admin/partners/applications/:id/reject. */
export const partnerApplicationRejectSchema = z.object({
  rejectionReasonCode: partnerApplicationRejectionReasonCodeSchema,
  reason: reasonSchema
});
/** Spec 051 data-model: one schema covering the three decisions, discriminated by `decision`. */
export const partnerApplicationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("review"), reason: reasonSchema }),
  z.object({ decision: z.literal("convert"), reason: reasonSchema }),
  z.object({ decision: z.literal("reject"), rejectionReasonCode: partnerApplicationRejectionReasonCodeSchema, reason: reasonSchema })
]);

/** Spec 051: response of a conversion. */
export interface PartnerApplicationConversionResult {
  application: AdminPartnerApplication;
  partnerTenantId: string;
  licenseId: string;
}

export type PartnerApplicationStatus = z.output<typeof partnerApplicationStatusSchema>;
export type PartnerApplicationCreateDto = z.input<typeof partnerApplicationCreateSchema>;
export type PartnerApplicationCreateInput = z.output<typeof partnerApplicationCreateSchema>;
export type PartnerApplicationResponse = z.output<typeof partnerApplicationResponseSchema>;
export type AdminPartnerApplication = z.output<typeof adminPartnerApplicationSchema>;
export type PartnerApplicationRejectionReasonCode = z.output<typeof partnerApplicationRejectionReasonCodeSchema>;
export type PartnerApplicationDecisionDto = z.input<typeof partnerApplicationDecisionSchema>;
export type PartnerApplicationDecision = z.output<typeof partnerApplicationDecisionSchema>;
