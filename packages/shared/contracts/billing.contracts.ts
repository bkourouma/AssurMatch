import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

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
  /** Spec 060 J-03: invoice whose recorded payment justified the grant, when there is one. */
  invoiceId: uuidSchema.nullable().optional(),
  grantedAt: dateTimeStringSchema
});

export const leadPackGrantSchema = z.object({
  partnerId: uuidSchema,
  credits: z.number().int().min(1).max(10_000),
  reason: z.string().trim().min(3).max(300),
  invoiceId: uuidSchema.optional()
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

/**
 * Spec 060 - manual B2B invoicing (PRD v0.3 EPIC J, decision D-8). An issued invoice is an
 * immutable snapshot of a monthly draft; payments are recorded by finance after they were received
 * outside the platform (bank transfer, mobile money). Online payment stays out of scope:
 * `paymentsEnabled` remains false everywhere. Amounts are whole XOF (no minor unit).
 */
export const issuedInvoiceStatusSchema = z.enum(["issued", "partially_paid", "paid", "cancelled"]);
export const invoicePaymentMethodSchema = z.enum(["bank_transfer", "mobile_money", "cheque", "other"]);
const xofAmountSchema = z.number().int();

export const issuedInvoiceLineSchema = z.object({
  kind: draftInvoiceLineSchema.shape.kind,
  label: nonEmptyStringSchema,
  quantity: z.number().min(0),
  unitAmount: z.number(),
  amount: xofAmountSchema,
  /** Pack and dispute credits are already netted out of the draft total: shown for information only. */
  informational: z.boolean()
});

export const invoiceIssuerSchema = z.object({
  legalName: nonEmptyStringSchema,
  address: nonEmptyStringSchema,
  registrationNumber: nonEmptyStringSchema,
  taxIdLabel: nonEmptyStringSchema,
  taxId: nonEmptyStringSchema,
  email: nonEmptyStringSchema,
  paymentInstructions: nonEmptyStringSchema
});

export const invoiceCustomerSchema = z.object({
  partnerId: uuidSchema,
  legalName: nonEmptyStringSchema,
  tradeName: z.string().nullable(),
  city: z.string().nullable(),
  registrationNumber: z.string().nullable()
});

export const invoicePaymentSchema = z.object({
  id: uuidSchema,
  invoiceId: uuidSchema,
  amount: xofAmountSchema.min(1),
  receivedAt: dateStringSchema,
  method: invoicePaymentMethodSchema,
  reference: nonEmptyStringSchema,
  note: z.string().nullable(),
  recordedAt: dateTimeStringSchema
});

export const creditNoteSchema = z.object({
  id: uuidSchema,
  number: nonEmptyStringSchema,
  invoiceId: uuidSchema,
  invoiceNumber: nonEmptyStringSchema,
  partnerId: uuidSchema,
  countryCode: isoCountrySchema,
  currency: z.literal("XOF"),
  subtotalAmount: xofAmountSchema,
  vatAmount: xofAmountSchema,
  totalAmount: xofAmountSchema,
  reason: nonEmptyStringSchema,
  issuedAt: dateTimeStringSchema
});

export const issuedInvoiceSchema = z.object({
  id: uuidSchema,
  number: nonEmptyStringSchema,
  draftId: uuidSchema,
  countryCode: isoCountrySchema,
  plan: billingPlanKeySchema,
  status: issuedInvoiceStatusSchema,
  currency: z.literal("XOF"),
  periodFrom: dateTimeStringSchema,
  periodTo: dateTimeStringSchema,
  issuedAt: dateTimeStringSchema,
  dueDate: dateStringSchema,
  customer: invoiceCustomerSchema,
  issuer: invoiceIssuerSchema,
  legalMentionsComplete: z.boolean(),
  lines: z.array(issuedInvoiceLineSchema),
  subtotalAmount: xofAmountSchema,
  vatRatePercent: z.number().min(0).max(100),
  vatAmount: xofAmountSchema,
  totalAmount: xofAmountSchema,
  amountPaid: xofAmountSchema,
  amountDue: xofAmountSchema,
  creditNote: creditNoteSchema.nullable(),
  paymentsEnabled: z.literal(false)
});

export const issuedInvoiceDetailSchema = issuedInvoiceSchema.extend({
  payments: z.array(invoicePaymentSchema)
});

export const issuedInvoiceQuerySchema = z.object({
  partnerId: uuidSchema.optional(),
  status: issuedInvoiceStatusSchema.optional()
});

export const issueInvoiceRequestSchema = z.object({
  draftId: uuidSchema,
  reason: z.string().trim().min(3).max(300)
});

export const recordInvoicePaymentSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000_000),
  receivedAt: dateStringSchema,
  method: invoicePaymentMethodSchema,
  reference: z.string().trim().min(2).max(120),
  note: z.string().trim().max(300).optional()
});

export const creditNoteRequestSchema = z.object({
  reason: z.string().trim().min(8).max(300)
});

export const accountEntrySchema = z.object({
  kind: z.enum(["invoice", "credit_note", "payment"]),
  documentId: uuidSchema,
  reference: nonEmptyStringSchema,
  date: dateTimeStringSchema,
  label: nonEmptyStringSchema,
  debit: xofAmountSchema,
  credit: xofAmountSchema,
  balance: xofAmountSchema
});

export const accountStatementSchema = z.object({
  partnerId: uuidSchema,
  currency: z.literal("XOF"),
  generatedAt: dateTimeStringSchema,
  totals: z.object({
    invoiced: xofAmountSchema,
    credited: xofAmountSchema,
    paid: xofAmountSchema,
    balanceDue: xofAmountSchema
  }),
  entries: z.array(accountEntrySchema),
  invoices: z.array(issuedInvoiceSchema),
  packs: z.array(leadPackSchema),
  packCreditsRemaining: z.number().int().min(0),
  paymentsEnabled: z.literal(false),
  notice: nonEmptyStringSchema
});

export type IssuedInvoiceStatus = z.infer<typeof issuedInvoiceStatusSchema>;
export type InvoicePaymentMethod = z.infer<typeof invoicePaymentMethodSchema>;
export type IssuedInvoiceLine = z.infer<typeof issuedInvoiceLineSchema>;
export type InvoiceIssuer = z.infer<typeof invoiceIssuerSchema>;
export type InvoiceCustomer = z.infer<typeof invoiceCustomerSchema>;
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;
export type CreditNote = z.infer<typeof creditNoteSchema>;
export type IssuedInvoice = z.infer<typeof issuedInvoiceSchema>;
export type IssuedInvoiceDetail = z.infer<typeof issuedInvoiceDetailSchema>;
export type IssuedInvoiceQuery = z.infer<typeof issuedInvoiceQuerySchema>;
export type IssueInvoiceRequest = z.infer<typeof issueInvoiceRequestSchema>;
export type RecordInvoicePayment = z.infer<typeof recordInvoicePaymentSchema>;
export type CreditNoteRequest = z.infer<typeof creditNoteRequestSchema>;
export type AccountEntry = z.infer<typeof accountEntrySchema>;
export type AccountStatement = z.infer<typeof accountStatementSchema>;
