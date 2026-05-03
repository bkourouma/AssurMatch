import type { FlagRecord } from "./feature-flag-precedence.service";

export const featureFlagMutationRefusedAction = "feature_flag.change_refused";
export const sensitiveFeatureFlagRefusalReason = "explicit_policy_required_for_sensitive_feature_flag";

const aiFlagsWithExplicitMutationPolicy = new Set(["ai_summary_enabled"]);

const explicitlyProtectedFeatureFlags = new Set([
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "ai_recommendation_enabled",
  "ai_lead_scoring_enabled",
  "ai_duplicate_detection_enabled",
  "ai_broker_assistant_enabled",
  "multi_broker_routing_enabled"
]);

const regulatedFlagKeyFragments = [
  "payment",
  "premium",
  "e_signature",
  "signature",
  "policy_issuance",
  "policy_issue",
  "contract_issuance",
  "attestation",
  "claim",
  "insurer_api",
  "insurer"
];

export interface FeatureFlagMutationPolicyInput {
  key: string;
  scopeType: FlagRecord["scopeType"];
  scopeId?: string;
  value: boolean;
  allowSensitiveDisable?: boolean;
}

export type FeatureFlagMutationDecision =
  | { allowed: true }
  | {
      allowed: false;
      policy: "sensitive_feature_flag_mutation_guard";
      reason: typeof sensitiveFeatureFlagRefusalReason;
      message: string;
    };

export function evaluateFeatureFlagMutation(input: FeatureFlagMutationPolicyInput): FeatureFlagMutationDecision {
  const key = normalizeKey(input.key);
  if (!isSensitiveFeatureFlagKey(key)) return { allowed: true };
  if (input.allowSensitiveDisable === true && input.value === false) return { allowed: true };
  return {
    allowed: false,
    policy: "sensitive_feature_flag_mutation_guard",
    reason: sensitiveFeatureFlagRefusalReason,
    message: `Forbidden feature flag mutation: ${input.key} requires explicit compliance policy approval`
  };
}

export function isSensitiveFeatureFlagKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (explicitlyProtectedFeatureFlags.has(normalized)) return true;
  if (normalized.startsWith("ai_") && !aiFlagsWithExplicitMutationPolicy.has(normalized)) return true;
  return regulatedFlagKeyFragments.some((fragment) => normalized.includes(fragment));
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}
