import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

export const billingFoundationQuerySchema = z.object({
  partnerId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25)
});

export const billingFoundationPartnerSummarySchema = z.object({
  partnerId: uuidSchema,
  partnerName: nonEmptyStringSchema,
  plan: z.enum(["starter", "pro", "enterprise"]),
  acceptedLeadCount: z.number().int().min(0),
  disputedLeadCount: z.number().int().min(0),
  draftNonBillableReference: nonEmptyStringSchema,
  invoiceStatus: z.literal("draft_not_billable"),
  paymentStatus: z.literal("not_applicable")
});

export const billingFoundationResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  billingEnabled: z.boolean(),
  paymentsEnabled: z.literal(false),
  collectionEnabled: z.literal(false),
  currency: z.literal("XOF"),
  period: z.object({ from: dateTimeStringSchema, to: dateTimeStringSchema }),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(50),
  total: z.number().int().min(0),
  totals: z.object({
    partners: z.number().int().min(0),
    acceptedLeadCount: z.number().int().min(0),
    disputedLeadCount: z.number().int().min(0)
  }),
  partners: z.array(billingFoundationPartnerSummarySchema),
  restrictions: z.array(nonEmptyStringSchema)
});

export type BillingFoundationQuery = z.infer<typeof billingFoundationQuerySchema>;
export type BillingFoundationPartnerSummary = z.infer<typeof billingFoundationPartnerSummarySchema>;
export type BillingFoundationResponse = z.infer<typeof billingFoundationResponseSchema>;
