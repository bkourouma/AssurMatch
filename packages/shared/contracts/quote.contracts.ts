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
  status: z.enum(["received", "contacted", "seen", "accepted", "rejected", "closed", "disputed"]),
  reason: reasonSchema
});

export const brokerStarterLeadStatusSchema = z.enum(["assigned", "broker_notified", "seen", "accepted", "rejected", "disputed", "closed"]);

export const brokerStarterReasonSchema = z.enum(["lead_quality", "wrong_scope", "unreachable_prospect", "duplicate", "compliance_concern"]);

const brokerStarterLeadListQueryBaseSchema = paginationQuerySchema.extend({
  status: brokerStarterLeadStatusSchema.optional(),
  productKey: nonEmptyStringSchema.optional(),
  countryCode: isoCountrySchema.optional(),
  dateFrom: dateTimeStringSchema.optional(),
  dateTo: dateTimeStringSchema.optional()
});

export const brokerStarterLeadListQuerySchema = brokerStarterLeadListQueryBaseSchema.refine((value) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo), {
  message: "dateFrom must be before dateTo"
});

export const brokerStarterLeadSummarySchema = brokerLeadSummarySchema.extend({
  status: brokerStarterLeadStatusSchema,
  seen: z.boolean(),
  seenAt: dateTimeStringSchema.optional()
});

export const brokerStarterLeadHistoryEventSchema = z.object({
  id: z.string(),
  eventType: z.enum(["assigned", "viewed", "accepted", "rejected", "disputed", "notification_read", "exported", "blocked"]),
  previousStatus: brokerStarterLeadStatusSchema.optional(),
  nextStatus: brokerStarterLeadStatusSchema.optional(),
  reason: brokerStarterReasonSchema.optional(),
  comment: z.string().max(500).optional(),
  occurredAt: dateTimeStringSchema
});

export const brokerStarterLeadDetailSchema = brokerStarterLeadSummarySchema.extend({
  contact: z.record(z.string(), z.unknown()).default({}),
  answers: z.record(z.string(), z.unknown()).default({}),
  history: z.array(brokerStarterLeadHistoryEventSchema).default([])
});

export const brokerStarterLeadActionRequestSchema = z.object({
  reason: brokerStarterReasonSchema.optional(),
  comment: z.string().trim().max(500).optional()
});

export const brokerStarterDashboardQuerySchema = brokerStarterLeadListQueryBaseSchema
  .omit({ page: true, pageSize: true })
  .partial()
  .refine((value) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo), {
    message: "dateFrom must be before dateTo"
  });

export const brokerStarterDashboardSchema = z.object({
  received: z.number().int().nonnegative(),
  seen: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  disputed: z.number().int().nonnegative()
});

export const brokerStarterNotificationSchema = z.object({
  id: uuidSchema,
  type: nonEmptyStringSchema,
  leadAssignmentId: uuidSchema,
  createdAt: dateTimeStringSchema,
  read: z.boolean()
});

export const brokerStarterExportQuerySchema = brokerStarterLeadListQueryBaseSchema
  .omit({ page: true, pageSize: true })
  .extend({
    maxRows: z.coerce.number().int().positive().max(1000).default(500)
  })
  .refine((value) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo), {
    message: "dateFrom must be before dateTo"
  });

export const brokerStarterPlanCapabilitiesSchema = z.object({
  plan: z.literal("starter"),
  allowed: z.array(nonEmptyStringSchema),
  blocked: z.array(nonEmptyStringSchema)
});

export const brokerCrmPipelineStatusSchema = z.enum([
  "nouveau",
  "accepte",
  "contact_tente",
  "contacte",
  "qualifie",
  "documents_demandes",
  "devis_en_preparation",
  "devis_envoye",
  "negociation",
  "gagne",
  "perdu",
  "doublon",
  "injoignable",
  "hors_cible",
  "rejete_conteste"
]);

export const brokerCrmUrgencySchema = z.enum(["low", "normal", "high", "urgent"]);
export const brokerCrmSourceSchema = z.enum(["comparator", "quote_request", "manual_import", "partner_referral", "support"]);
export const brokerCrmOutcomeReasonSchema = z.enum(["price", "coverage", "unreachable", "duplicate", "wrong_scope", "out_of_target", "invalid_lead", "client_abandoned", "compliance_concern"]);

const brokerCrmLeadListQueryBaseSchema = paginationQuerySchema.extend({
  status: brokerCrmPipelineStatusSchema.optional(),
  productKey: nonEmptyStringSchema.optional(),
  countryCode: isoCountrySchema.optional(),
  advisorId: z.string().trim().optional(),
  urgency: brokerCrmUrgencySchema.optional(),
  source: brokerCrmSourceSchema.optional(),
  dateFrom: dateTimeStringSchema.optional(),
  dateTo: dateTimeStringSchema.optional(),
  search: z.string().trim().max(120).optional()
});

export const brokerCrmLeadListQuerySchema = brokerCrmLeadListQueryBaseSchema.refine((value) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo), {
  message: "dateFrom must be before dateTo"
});

export const brokerCrmLeadSummarySchema = z.object({
  leadAssignmentId: uuidSchema,
  publicReference: nonEmptyStringSchema,
  countryCode: isoCountrySchema,
  productKey: nonEmptyStringSchema,
  status: brokerCrmPipelineStatusSchema,
  assignedAt: dateTimeStringSchema,
  urgency: brokerCrmUrgencySchema,
  source: brokerCrmSourceSchema,
  advisorId: z.string().optional(),
  prospectName: z.string().optional(),
  emailMasked: z.string().optional(),
  phoneMasked: z.string().optional()
});

export const brokerCrmHistoryEventSchema = z.object({
  id: z.string(),
  eventType: z.enum(["status_changed", "note_created", "task_created", "reminder_created", "assigned", "document_added", "proposal_added", "disputed", "exported"]),
  previousStatus: brokerCrmPipelineStatusSchema.optional(),
  nextStatus: brokerCrmPipelineStatusSchema.optional(),
  reason: brokerCrmOutcomeReasonSchema.optional(),
  occurredAt: dateTimeStringSchema
});

export const brokerCrmNoteSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  body: z.string(),
  authorId: z.string().optional(),
  createdAt: dateTimeStringSchema
});

export const brokerCrmTaskSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  title: nonEmptyStringSchema,
  assigneeId: z.string().optional(),
  dueAt: dateTimeStringSchema.optional(),
  completedAt: dateTimeStringSchema.optional(),
  createdAt: dateTimeStringSchema
});

export const brokerCrmReminderSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  assigneeId: z.string().optional(),
  remindAt: dateTimeStringSchema,
  message: z.string().optional(),
  createdAt: dateTimeStringSchema
});

export const brokerCrmDocumentSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  label: nonEmptyStringSchema,
  storageKey: nonEmptyStringSchema,
  visibility: z.enum(["internal", "prospect_provided"]),
  createdAt: dateTimeStringSchema
});

export const brokerCrmProposalSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  reference: nonEmptyStringSchema,
  amountIndicative: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(3).default("XOF"),
  notes: z.string().optional(),
  nonContractual: z.literal(true).default(true),
  createdAt: dateTimeStringSchema
});

export const brokerCrmDisputeSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  reason: brokerCrmOutcomeReasonSchema,
  comment: z.string().optional(),
  status: z.enum(["opened", "under_review", "accepted", "rejected"]).default("opened"),
  createdAt: dateTimeStringSchema
});

export const brokerCrmLeadDetailSchema = brokerCrmLeadSummarySchema.extend({
  contact: z.record(z.string(), z.unknown()).default({}),
  answers: z.record(z.string(), z.unknown()).default({}),
  history: z.array(brokerCrmHistoryEventSchema).default([]),
  notes: z.array(brokerCrmNoteSchema).default([]),
  tasks: z.array(brokerCrmTaskSchema).default([]),
  reminders: z.array(brokerCrmReminderSchema).default([]),
  documents: z.array(brokerCrmDocumentSchema).default([]),
  proposals: z.array(brokerCrmProposalSchema).default([]),
  disputes: z.array(brokerCrmDisputeSchema).default([])
});

export const brokerCrmStatusUpdateSchema = z.object({
  status: brokerCrmPipelineStatusSchema,
  reason: brokerCrmOutcomeReasonSchema.optional()
}).superRefine((value, ctx) => {
  if (["perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"].includes(value.status) && !value.reason) {
    ctx.addIssue({ code: "custom", message: "reason is required for final or disputed CRM statuses" });
  }
});

export const brokerCrmNoteCreateSchema = z.object({ body: z.string().trim().min(1).max(1000) });
export const brokerCrmTaskCreateSchema = z.object({ title: nonEmptyStringSchema, assigneeId: z.string().optional(), dueAt: dateTimeStringSchema.optional() });
export const brokerCrmReminderCreateSchema = z.object({ assigneeId: z.string().optional(), remindAt: dateTimeStringSchema, message: z.string().trim().max(500).optional() });
export const brokerCrmAssignRequestSchema = z.object({ advisorId: nonEmptyStringSchema, advisorPartnerTenantId: nonEmptyStringSchema });
export const brokerCrmDocumentCreateSchema = z.object({ label: nonEmptyStringSchema, storageKey: nonEmptyStringSchema, visibility: z.enum(["internal", "prospect_provided"]).default("internal") });
export const brokerCrmProposalCreateSchema = z.object({ reference: nonEmptyStringSchema, amountIndicative: z.number().nonnegative().optional(), currency: z.string().min(3).max(3).default("XOF"), notes: z.string().max(500).optional() });
export const brokerCrmDisputeCreateSchema = z.object({ reason: brokerCrmOutcomeReasonSchema, comment: z.string().max(500).optional() });

export const brokerCrmDashboardSchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
  urgent: z.number().int().nonnegative(),
  overdueTasks: z.number().int().nonnegative()
});

export const brokerCrmExportQuerySchema = brokerCrmLeadListQueryBaseSchema.omit({ page: true, pageSize: true }).extend({
  maxRows: z.coerce.number().int().positive().max(2000).default(500)
}).refine((value) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo), {
  message: "dateFrom must be before dateTo"
});

export const brokerCrmNotificationSchema = z.object({
  id: z.string(),
  type: z.enum(["lead_assigned", "task_due", "reminder_due", "status_changed"]),
  leadAssignmentId: z.string(),
  read: z.boolean(),
  createdAt: dateTimeStringSchema
});

export const brokerCrmAiFoundationsSchema = z.object({
  enabled: z.literal(false),
  availableAssistTypes: z.array(z.enum(["lead_summary", "next_action", "relaunch_message", "loss_analysis"])),
  message: nonEmptyStringSchema
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
export type BrokerStarterLeadStatus = z.output<typeof brokerStarterLeadStatusSchema>;
export type BrokerStarterReason = z.output<typeof brokerStarterReasonSchema>;
export type BrokerStarterLeadListQuery = z.input<typeof brokerStarterLeadListQuerySchema>;
export type BrokerStarterLeadSummary = z.output<typeof brokerStarterLeadSummarySchema>;
export type BrokerStarterLeadDetail = z.output<typeof brokerStarterLeadDetailSchema>;
export type BrokerStarterLeadActionRequest = z.input<typeof brokerStarterLeadActionRequestSchema>;
export type BrokerStarterLeadHistoryEvent = z.output<typeof brokerStarterLeadHistoryEventSchema>;
export type BrokerStarterDashboardQuery = z.input<typeof brokerStarterDashboardQuerySchema>;
export type BrokerStarterDashboard = z.output<typeof brokerStarterDashboardSchema>;
export type BrokerStarterNotification = z.output<typeof brokerStarterNotificationSchema>;
export type BrokerStarterExportQuery = z.input<typeof brokerStarterExportQuerySchema>;
export type BrokerStarterPlanCapabilities = z.output<typeof brokerStarterPlanCapabilitiesSchema>;
export type BrokerCrmPipelineStatus = z.output<typeof brokerCrmPipelineStatusSchema>;
export type BrokerCrmUrgency = z.output<typeof brokerCrmUrgencySchema>;
export type BrokerCrmSource = z.output<typeof brokerCrmSourceSchema>;
export type BrokerCrmOutcomeReason = z.output<typeof brokerCrmOutcomeReasonSchema>;
export type BrokerCrmLeadListQuery = z.input<typeof brokerCrmLeadListQuerySchema>;
export type BrokerCrmLeadSummary = z.output<typeof brokerCrmLeadSummarySchema>;
export type BrokerCrmLeadDetail = z.output<typeof brokerCrmLeadDetailSchema>;
export type BrokerCrmHistoryEvent = z.output<typeof brokerCrmHistoryEventSchema>;
export type BrokerCrmStatusUpdate = z.input<typeof brokerCrmStatusUpdateSchema>;
export type BrokerCrmNote = z.output<typeof brokerCrmNoteSchema>;
export type BrokerCrmTask = z.output<typeof brokerCrmTaskSchema>;
export type BrokerCrmReminder = z.output<typeof brokerCrmReminderSchema>;
export type BrokerCrmDocument = z.output<typeof brokerCrmDocumentSchema>;
export type BrokerCrmProposal = z.output<typeof brokerCrmProposalSchema>;
export type BrokerCrmDispute = z.output<typeof brokerCrmDisputeSchema>;
export type BrokerCrmDashboard = z.output<typeof brokerCrmDashboardSchema>;
export type BrokerCrmExportQuery = z.input<typeof brokerCrmExportQuerySchema>;
export type BrokerCrmNotification = z.output<typeof brokerCrmNotificationSchema>;
export type BrokerCrmAiFoundations = z.output<typeof brokerCrmAiFoundationsSchema>;
export type AdminQuoteRequestQuery = z.output<typeof adminQuoteRequestQuerySchema>;
