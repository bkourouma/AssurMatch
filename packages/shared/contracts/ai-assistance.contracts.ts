import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema } from "../validation/common.schemas";

export const aiAssistanceSurfaceSchema = z.enum(["broker_crm", "admin_platform"]);
export const aiAssistTypeSchema = z.enum([
  "lead_summary", "lead_score", "next_action", "relaunch_message", "lead_classification", "duplicate_hint", "loss_analysis",
  "admin_risk_triage", "activation_gap_summary", "offer_consistency_check", "activity_report", "suspicious_leads"
]);

export const aiAssistanceStatusSchema = z.object({
  generatedAt: dateTimeStringSchema,
  surface: aiAssistanceSurfaceSchema,
  /** True only when at least one assist type of the surface is enabled by flags for the actor's scope. */
  enabled: z.boolean(),
  /** True when a model provider (not the deterministic template) is configured. */
  modelCall: z.boolean(),
  provider: nonEmptyStringSchema.default("template"),
  humanValidationRequired: z.literal(true),
  auditPolicy: z.literal("metadata_only"),
  availableAssistTypes: z.array(aiAssistTypeSchema),
  flags: z.array(z.object({
    key: nonEmptyStringSchema,
    value: z.boolean(),
    required: z.boolean()
  })),
  guardrails: z.object({
    centralAiModuleOnly: z.literal(true),
    piiMinimized: z.literal(true),
    outputIsAdvisory: z.literal(true),
    noAutomatedDecision: z.literal(true)
  }),
  message: nonEmptyStringSchema
});

export type AIAssistanceSurface = z.infer<typeof aiAssistanceSurfaceSchema>;
export type AIAssistType = z.infer<typeof aiAssistTypeSchema>;
export type AIAssistanceStatus = z.infer<typeof aiAssistanceStatusSchema>;
