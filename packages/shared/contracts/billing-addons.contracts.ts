import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema, isoCountrySchema, uuidSchema } from "../validation/common.schemas";
import { billingPlanKeySchema } from "./billing.contracts";

/**
 * Lot 5 (spec 071), hypothesis H4: the setup fee is a one-time line of the broker's first invoice and
 * the API, white-label and AI add-ons are optional monthly packages priced per country and plan.
 * Add-ons are disabled by default (a price row only applies when `enabled`), assigned to one broker by
 * finance (audited) and added to the monthly draft as `add_on` lines.
 */
export const billingAddOnKindSchema = z.enum(["api", "white_label", "ai"]);
export type BillingAddOnKind = z.infer<typeof billingAddOnKindSchema>;
export const BILLING_ADD_ON_LABELS: Record<BillingAddOnKind, string> = {
  api: "Accès API",
  white_label: "Marque blanche",
  ai: "Module IA"
};

export const billingAddOnPriceSchema = z.object({
  id: uuidSchema,
  kind: billingAddOnKindSchema,
  plan: billingPlanKeySchema,
  countryCode: isoCountrySchema,
  monthlyAmount: z.number().min(0),
  enabled: z.boolean(),
  currency: z.literal("XOF"),
  updatedAt: dateTimeStringSchema
});

export const billingAddOnPriceUpsertSchema = z.object({
  kind: billingAddOnKindSchema,
  plan: billingPlanKeySchema,
  countryCode: isoCountrySchema,
  monthlyAmount: z.number().min(0).max(10_000_000),
  /** Disabled unless explicitly opened. */
  enabled: z.boolean().default(false),
  reason: z.string().trim().min(3).max(300)
});

export const partnerAddOnStatusSchema = z.enum(["active", "ended"]);

export const partnerAddOnSchema = z.object({
  id: uuidSchema,
  partnerId: uuidSchema,
  kind: billingAddOnKindSchema,
  status: partnerAddOnStatusSchema,
  reason: z.string(),
  assignedAt: dateTimeStringSchema,
  endedAt: dateTimeStringSchema.nullable()
});

export const partnerAddOnAssignSchema = z.object({
  partnerId: uuidSchema,
  kind: billingAddOnKindSchema,
  reason: z.string().trim().min(3).max(300)
});

export const partnerAddOnEndSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const partnerAddOnQuerySchema = z.object({ partnerId: uuidSchema.optional() });

/** Commercial subscription state read by routing check 11 (plan status) and check 9 (contract window). */
export const partnerSubscriptionStatusSchema = z.enum(["active", "suspended", "cancelled"]);

export const partnerSubscriptionSchema = z.object({
  partnerId: uuidSchema,
  status: partnerSubscriptionStatusSchema,
  contractExpiresAt: dateStringSchema.nullable(),
  reason: z.string().nullable(),
  updatedAt: dateTimeStringSchema.nullable()
});

export const partnerSubscriptionUpdateSchema = z.object({
  status: partnerSubscriptionStatusSchema,
  /** null clears the expiry (indefinite contract); omitted keeps the stored value. */
  contractExpiresAt: dateStringSchema.nullable().optional(),
  reason: z.string().trim().min(3).max(300)
});

export type BillingAddOnPrice = z.infer<typeof billingAddOnPriceSchema>;
export type BillingAddOnPriceUpsert = z.input<typeof billingAddOnPriceUpsertSchema>;
export type PartnerAddOn = z.infer<typeof partnerAddOnSchema>;
export type PartnerAddOnAssign = z.input<typeof partnerAddOnAssignSchema>;
export type PartnerSubscription = z.infer<typeof partnerSubscriptionSchema>;
export type PartnerSubscriptionUpdate = z.input<typeof partnerSubscriptionUpdateSchema>;
