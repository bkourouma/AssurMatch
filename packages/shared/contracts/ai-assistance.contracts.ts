import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema } from "../validation/common.schemas";

export const aiAssistanceSurfaceSchema = z.enum(["broker_crm", "admin_platform"]);
export const aiAssistTypeSchema = z.enum(["lead_summary", "next_action", "relaunch_message", "loss_analysis", "admin_risk_triage", "activation_gap_summary"]);

export const aiAssistanceStatusSchema = z.object({
  generatedAt: dateTimeStringSchema,
  surface: aiAssistanceSurfaceSchema,
  enabled: z.literal(false),
  modelCall: z.literal(false),
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
