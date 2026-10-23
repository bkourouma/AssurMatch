import { z } from "zod";

/**
 * Lot 7 / spec 074 (FR-001 to FR-006): per-country and per-product AI flags, changed through an
 * audited and protected path (never through the catalogue toggles, which refuse these keys).
 */
export const COUNTRY_AI_SCOPE_FLAG_KEYS = ["country_ai_enabled"] as const;
export const PRODUCT_AI_SCOPE_FLAG_KEYS = ["product_ai_scoring_enabled", "product_ai_form_assistant_enabled"] as const;
export const AI_SCOPE_FLAG_KEYS = [...COUNTRY_AI_SCOPE_FLAG_KEYS, ...PRODUCT_AI_SCOPE_FLAG_KEYS] as const;

export const AI_GLOBAL_FLAG_KEYS = [
  "ai_summary_enabled",
  "ai_lead_scoring_enabled",
  "ai_duplicate_detection_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled",
  "ai_routing_anomaly_detection_enabled"
] as const;

export type AiScopeFlagKey = (typeof AI_SCOPE_FLAG_KEYS)[number];
export type AiScopeType = "country" | "product";

export const aiScopeFlagKeySchema = z.enum(AI_SCOPE_FLAG_KEYS);

export const aiScopeFlagChangeSchema = z
  .object({
    scopeType: z.enum(["country", "product"]),
    scopeId: z.string().uuid(),
    key: aiScopeFlagKeySchema,
    value: z.boolean(),
    reference: z.string().trim().min(3).max(120).optional(),
    approvedBy: z.string().trim().min(3).max(120).optional(),
    reason: z.string().trim().min(8).max(500)
  })
  .superRefine((input, ctx) => {
    const allowed: readonly string[] = input.scopeType === "country" ? COUNTRY_AI_SCOPE_FLAG_KEYS : PRODUCT_AI_SCOPE_FLAG_KEYS;
    if (!allowed.includes(input.key)) ctx.addIssue({ code: "custom", path: ["key"], message: "key does not belong to the scope type" });
  });

export type AiScopeFlagChangeInput = z.input<typeof aiScopeFlagChangeSchema>;
export type AiScopeFlagChangeDto = z.output<typeof aiScopeFlagChangeSchema>;

export interface AiScopeFlagsOverview {
  generatedAt: string;
  globalFlags: Array<{ key: string; value: boolean }>;
  countries: Array<{ id: string; code: string; name: string; flags: { country_ai_enabled: boolean } }>;
  products: Array<{
    id: string;
    key: string;
    name: string;
    sensitivity: "standard" | "sensitive" | "highly_sensitive";
    flags: { product_ai_scoring_enabled: boolean; product_ai_form_assistant_enabled: boolean };
  }>;
  history: Array<{ key: string; scopeType: AiScopeType; scopeId: string; value: boolean; reason: string; changedAt: string }>;
}

export interface AiScopeFlagChangeResult {
  scopeType: AiScopeType;
  scopeId: string;
  key: AiScopeFlagKey;
  previousValue: boolean;
  value: boolean;
  appliedAt: string;
}
