import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, paginationQuerySchema, uuidSchema } from "../validation/common.schemas";

/**
 * Spec 063 (CRM-012): a broker may dispute a lead within 30 days after its reception
 * (the assignment date). The finance admin decides; an accepted dispute is credited.
 */
export const LEAD_DISPUTE_WINDOW_DAYS = 30;

export const leadDisputeStatusSchema = z.enum(["opened", "accepted", "rejected"]);
export const leadDisputeSourceSchema = z.enum(["starter", "crm"]);
/**
 * How an accepted dispute is credited: next draft invoice, automatic partial credit note, one lead
 * given back to the prepaid pack ("pack_credit"), or nothing to credit (manual).
 */
export const leadDisputeCreditModeSchema = z.enum(["draft_invoice", "credit_note", "pack_credit", "none"]);
export const leadDisputeDecisionSchema = z.enum(["accept", "reject"]);

export const leadDisputeDecisionRequestSchema = z.object({
  decision: leadDisputeDecisionSchema,
  reason: z.string().trim().min(10).max(1000)
});

export const adminLeadDisputeQuerySchema = paginationQuerySchema.extend({
  status: leadDisputeStatusSchema.optional(),
  partnerId: uuidSchema.optional(),
  countryCode: isoCountrySchema.optional(),
  from: dateTimeStringSchema.optional(),
  to: dateTimeStringSchema.optional()
}).refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), { message: "from must be before to" });

/** Dispute window of a lead, exposed so the interface can hide or disable the "Contester" action. */
export const leadDisputeWindowSchema = z.object({
  deadline: dateTimeStringSchema,
  open: z.boolean()
});

const leadDisputeDecisionFields = {
  decidedAt: dateTimeStringSchema.optional(),
  decisionReason: z.string().optional(),
  creditMode: leadDisputeCreditModeSchema.optional(),
  creditNoteId: z.string().optional(),
  /** "pack_credit" mode: the lead pack row that gave one credit back. */
  creditPackId: z.string().optional(),
  creditNoteNumber: z.string().optional(),
  /** Credited amount, XOF including VAT (credit note total); absent for the draft invoice and "none" modes. */
  creditAmount: z.number().int().nonnegative().optional()
};

/** What the broker sees of a dispute (own tenant only): no admin identity, no other tenant data. */
export const brokerLeadDisputeViewSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  publicReference: z.string().optional(),
  source: leadDisputeSourceSchema,
  status: leadDisputeStatusSchema,
  reason: nonEmptyStringSchema,
  comment: z.string().optional(),
  createdAt: dateTimeStringSchema,
  ...leadDisputeDecisionFields
});

/** Admin list / detail row. Never carries lead contact or answers. */
export const adminLeadDisputeSchema = brokerLeadDisputeViewSchema.extend({
  partnerTenantId: z.string(),
  partnerName: z.string().optional(),
  countryCode: z.string().optional(),
  productKey: z.string().optional(),
  assignedAt: dateTimeStringSchema.optional(),
  decidedById: z.string().optional()
});

export const adminLeadDisputeListSchema = z.object({
  items: z.array(adminLeadDisputeSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative()
});

export type LeadDisputeStatus = z.output<typeof leadDisputeStatusSchema>;
export type LeadDisputeSource = z.output<typeof leadDisputeSourceSchema>;
export type LeadDisputeCreditMode = z.output<typeof leadDisputeCreditModeSchema>;
export type LeadDisputeDecisionRequest = z.input<typeof leadDisputeDecisionRequestSchema>;
export type AdminLeadDisputeQuery = z.input<typeof adminLeadDisputeQuerySchema>;
export type LeadDisputeWindow = z.output<typeof leadDisputeWindowSchema>;
export type BrokerLeadDisputeView = z.output<typeof brokerLeadDisputeViewSchema>;
export type AdminLeadDispute = z.output<typeof adminLeadDisputeSchema>;
export type AdminLeadDisputeList = z.output<typeof adminLeadDisputeListSchema>;

/** Deadline of the dispute window for a lead received (assigned) at `assignedAt`. */
export function leadDisputeDeadline(assignedAt: Date | string): Date {
  return new Date(new Date(assignedAt).getTime() + LEAD_DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function leadDisputeWindowFor(assignedAt: Date | string, now: Date = new Date()): LeadDisputeWindow {
  const deadline = leadDisputeDeadline(assignedAt);
  return { deadline: deadline.toISOString(), open: now.getTime() <= deadline.getTime() };
}
