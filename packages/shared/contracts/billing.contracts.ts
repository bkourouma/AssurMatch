import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

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

export const billingPlanKeySchema = z.enum(["starter", "pro", "enterprise"]);

/**
 * Spec 042 D1: a lead shared between several brokers is billed at a fraction of the exclusive
 * price, and the total charged across all recipients of one request is capped at
 * `perLeadPrice x SHARED_LEAD_TOTAL_CAP` so widening the fan-out can never become a revenue lever.
 */
export const SHARED_LEAD_DEFAULT_MULTIPLIER = 0.5;
export const SHARED_LEAD_TOTAL_CAP = 2;
export const sharedLeadPriceMultiplierSchema = z.number().min(0.1).max(1);

export const billingPlanPriceSchema = z.object({
  id: uuidSchema,
  plan: billingPlanKeySchema,
  countryCode: isoCountrySchema,
  monthlySubscription: z.number().min(0),
  perLeadPrice: z.number().min(0),
  sharedLeadPriceMultiplier: sharedLeadPriceMultiplierSchema,
  setupFee: z.number().min(0).default(0),
  currency: z.literal("XOF"),
  updatedAt: dateTimeStringSchema
});

export const billingPlanPriceUpsertSchema = z.object({
  plan: billingPlanKeySchema,
  countryCode: isoCountrySchema,
  monthlySubscription: z.number().min(0).max(10_000_000),
  perLeadPrice: z.number().min(0).max(1_000_000),
  sharedLeadPriceMultiplier: sharedLeadPriceMultiplierSchema.default(SHARED_LEAD_DEFAULT_MULTIPLIER),
  setupFee: z.number().min(0).max(10_000_000).default(0),
  reason: z.string().trim().min(3).max(300)
});

export const billableLeadCriteriaSchema = z.enum([
  "contact_reachable",
  "country_active",
  "product_active",
  "consent_collected",
  "not_duplicate",
  "broker_assigned",
  "minimum_information_complete"
]);

export const billableLeadEvaluationSchema = z.object({
  leadAssignmentId: nonEmptyStringSchema,
  billable: z.boolean(),
  failedCriteria: z.array(billableLeadCriteriaSchema),
  disputeCredited: z.boolean()
});

export const draftInvoiceLineSchema = z.object({
  kind: z.enum(["subscription", "billable_leads", "shared_leads", "pack_credit", "dispute_credit"]),
  label: nonEmptyStringSchema,
  quantity: z.number().min(0),
  unitAmount: z.number(),
  amount: z.number()
});

export const draftInvoiceSchema = z.object({
  id: uuidSchema,
  partnerId: uuidSchema,
  partnerName: nonEmptyStringSchema,
  plan: billingPlanKeySchema,
  countryCode: isoCountrySchema,
  periodFrom: dateTimeStringSchema,
  periodTo: dateTimeStringSchema,
  reference: nonEmptyStringSchema,
  status: z.literal("draft_not_billable"),
  paymentStatus: z.literal("not_applicable"),
  currency: z.literal("XOF"),
  lines: z.array(draftInvoiceLineSchema),
  billableLeadCount: z.number().int().min(0),
  nonBillableLeadCount: z.number().int().min(0),
  disputeCreditCount: z.number().int().min(0),
  packCreditsUsed: z.number().int().min(0),
  totalAmount: z.number(),
  computedAt: dateTimeStringSchema
});

export const leadPackSchema = z.object({
  id: uuidSchema,
  partnerId: uuidSchema,
  creditsGranted: z.number().int().min(1),
  creditsConsumed: z.number().int().min(0),
  creditsRemaining: z.number().int().min(0),
  reason: nonEmptyStringSchema,
  grantedAt: dateTimeStringSchema
});

export const leadPackGrantSchema = z.object({
  partnerId: uuidSchema,
  credits: z.number().int().min(1).max(10_000),
  reason: z.string().trim().min(3).max(300)
});

export const brokerBillingStatementSchema = z.object({
  generatedAt: dateTimeStringSchema,
  partnerTenantId: uuidSchema,
  plan: billingPlanKeySchema,
  billingEnabled: z.boolean(),
  paymentsEnabled: z.literal(false),
  collectionEnabled: z.literal(false),
  currency: z.literal("XOF"),
  period: z.object({ from: dateTimeStringSchema, to: dateTimeStringSchema }),
  leadsReceived: z.number().int().min(0),
  billableLeadCount: z.number().int().min(0),
  nonBillableLeadCount: z.number().int().min(0),
  disputeCreditCount: z.number().int().min(0),
  packCreditsRemaining: z.number().int().min(0),
  estimatedAmount: z.number().min(0),
  draft: draftInvoiceSchema.nullable(),
  notice: nonEmptyStringSchema
});

export const draftInvoiceQuerySchema = z.object({
  partnerId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25)
});

export const draftInvoiceRecomputeSchema = z.object({ partnerId: uuidSchema.optional(), reason: z.string().trim().min(3).max(300) });

export type BillingPlanKey = z.infer<typeof billingPlanKeySchema>;
export type BillingPlanPrice = z.infer<typeof billingPlanPriceSchema>;
export type BillingPlanPriceUpsert = z.infer<typeof billingPlanPriceUpsertSchema>;
export type BillableLeadCriteria = z.infer<typeof billableLeadCriteriaSchema>;
export type BillableLeadEvaluation = z.infer<typeof billableLeadEvaluationSchema>;
export type DraftInvoiceLine = z.infer<typeof draftInvoiceLineSchema>;
export type DraftInvoice = z.infer<typeof draftInvoiceSchema>;
export type LeadPack = z.infer<typeof leadPackSchema>;
export type LeadPackGrant = z.infer<typeof leadPackGrantSchema>;
export type BrokerBillingStatement = z.infer<typeof brokerBillingStatementSchema>;
export type DraftInvoiceQuery = z.infer<typeof draftInvoiceQuerySchema>;
export type DraftInvoiceRecompute = z.infer<typeof draftInvoiceRecomputeSchema>;
