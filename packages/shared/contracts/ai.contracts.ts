import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

export const aiSurfaceSchema = z.enum(["visitor", "broker_crm", "admin_platform"]);

export const visitorAssistTypes = ["visitor_product_assistant", "visitor_request_summary", "visitor_form_help", "visitor_consistency_check", "visitor_faq"] as const;
export const brokerAssistTypes = ["lead_summary", "lead_score", "next_action", "relaunch_message", "lead_classification", "duplicate_hint", "loss_analysis"] as const;
export const adminAssistTypes = ["admin_risk_triage", "activation_gap_summary", "offer_consistency_check", "activity_report", "suspicious_leads"] as const;
export const aiAssistTypes = [...visitorAssistTypes, ...brokerAssistTypes, ...adminAssistTypes] as const;
export const aiAssistTypeCatalogSchema = z.enum(aiAssistTypes);
export const visitorAssistTypeSchema = z.enum(visitorAssistTypes);

export const aiInteractionStatusSchema = z.enum(["queued", "completed", "refused", "failed"]);
export const aiHumanValidationStatusSchema = z.enum(["not_required", "pending", "approved", "rejected"]);

/** Fixed wording appended to every AI output (Constitution V: assistance, never a decision). */
export const AI_ASSISTANCE_DISCLAIMER = "Assistance IA indicative: le courtier partenaire confirmera les conditions, le devis et l'eligibilite.";

export const aiInteractionSchema = z.object({
  id: uuidSchema,
  assistType: aiAssistTypeCatalogSchema,
  surface: aiSurfaceSchema,
  status: aiInteractionStatusSchema,
  provider: nonEmptyStringSchema,
  model: z.string().nullable(),
  fallback: z.boolean(),
  outputText: z.string().nullable(),
  outputData: z.unknown().nullable(),
  guardrailResult: nonEmptyStringSchema,
  humanValidationStatus: aiHumanValidationStatusSchema,
  refusalReason: z.string().nullable(),
  disclaimer: nonEmptyStringSchema,
  assistanceLabel: nonEmptyStringSchema,
  createdAt: dateTimeStringSchema,
  completedAt: dateTimeStringSchema.nullable()
});

const answersSchema = z.record(z.string().max(64), z.unknown()).default({});

export const visitorProductAssistantRequestSchema = z.object({
  countryCode: isoCountrySchema,
  productKey: z.string().trim().max(64).optional(),
  need: z.string().trim().min(5).max(600),
  language: z.enum(["fr", "en"]).default("fr")
});

export const visitorRequestSummaryRequestSchema = z.object({
  countryCode: isoCountrySchema,
  productKey: z.string().trim().min(1).max(64),
  answers: answersSchema,
  language: z.enum(["fr", "en"]).default("fr")
});

export const visitorFormHelpRequestSchema = z.object({
  countryCode: isoCountrySchema,
  productKey: z.string().trim().min(1).max(64),
  fieldKey: z.string().trim().min(1).max(64),
  fieldLabel: z.string().trim().min(1).max(120),
  language: z.enum(["fr", "en"]).default("fr")
});

export const visitorConsistencyCheckRequestSchema = z.object({
  countryCode: isoCountrySchema,
  productKey: z.string().trim().min(1).max(64),
  answers: answersSchema,
  language: z.enum(["fr", "en"]).default("fr")
});

export const visitorFaqRequestSchema = z.object({
  countryCode: isoCountrySchema,
  question: z.string().trim().min(5).max(400),
  language: z.enum(["fr", "en"]).default("fr")
});

export const visitorAiRequestSchemas = {
  visitor_product_assistant: visitorProductAssistantRequestSchema,
  visitor_request_summary: visitorRequestSummaryRequestSchema,
  visitor_form_help: visitorFormHelpRequestSchema,
  visitor_consistency_check: visitorConsistencyCheckRequestSchema,
  visitor_faq: visitorFaqRequestSchema
} as const;

export const aiLeadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: z.enum(["low", "medium", "high"]),
  factors: z.array(z.object({ key: nonEmptyStringSchema, impact: z.enum(["positive", "negative", "neutral"]), explanation: nonEmptyStringSchema })).max(8)
});

export const brokerAssistTypeSchema = z.enum(brokerAssistTypes);
/** Lead-bound broker assistances; `loss_analysis` is tenant-level and Enterprise only. */
export const brokerLeadAssistTypes = ["lead_summary", "lead_score", "next_action", "relaunch_message", "lead_classification", "duplicate_hint"] as const;
export const brokerLeadAssistTypeSchema = z.enum(brokerLeadAssistTypes);
export const brokerAiRequestSchema = z.object({ language: z.enum(["fr", "en"]).default("fr") });
export const aiHumanValidationDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(500).optional()
});
export const aiLeadClassificationSchema = z.object({
  segment: z.enum(["particulier", "professionnel", "entreprise"]),
  productFamily: nonEmptyStringSchema,
  urgency: nonEmptyStringSchema,
  confidence: z.literal("indicative")
});
export const brokerAiOptOutSchema = z.object({ optOut: z.boolean(), reason: z.string().trim().min(3).max(300) });

export const adminAssistTypeSchema = z.enum(adminAssistTypes);
export const adminAiRequestSchema = z.object({
  language: z.enum(["fr", "en"]).default("fr"),
  /** Required for `offer_consistency_check`; ignored by the other admin assist types. */
  offerId: uuidSchema.optional(),
  from: dateTimeStringSchema.optional(),
  to: dateTimeStringSchema.optional()
});
export const brokerAiOptOutStatusSchema = z.object({
  partnerTenantId: nonEmptyStringSchema,
  optedOut: z.boolean(),
  updatedAt: dateTimeStringSchema.nullable()
});

export type AiSurface = z.output<typeof aiSurfaceSchema>;
export type BrokerAssistType = z.output<typeof brokerAssistTypeSchema>;
export type BrokerLeadAssistType = z.output<typeof brokerLeadAssistTypeSchema>;
export type AiHumanValidationDecision = z.output<typeof aiHumanValidationDecisionSchema>;
export type AiLeadClassification = z.output<typeof aiLeadClassificationSchema>;
export type BrokerAiOptOutStatus = z.output<typeof brokerAiOptOutStatusSchema>;
export type AdminAssistType = z.output<typeof adminAssistTypeSchema>;
export type AdminAiRequest = z.output<typeof adminAiRequestSchema>;
export type AiAssistTypeCatalog = z.output<typeof aiAssistTypeCatalogSchema>;
export type VisitorAssistType = z.output<typeof visitorAssistTypeSchema>;
export type AiInteractionStatus = z.output<typeof aiInteractionStatusSchema>;
export type AiHumanValidationStatus = z.output<typeof aiHumanValidationStatusSchema>;
export type AiInteraction = z.output<typeof aiInteractionSchema>;
export type AiLeadScore = z.output<typeof aiLeadScoreSchema>;
