import { z } from "zod";
import type { ActorContext } from "../../modules/common/types";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../modules/feature-flags/default-flags";
import type { FeatureFlag, FeatureFlagsService } from "../../modules/feature-flags/feature-flags.module";

/**
 * Spec 059 follow-up: the audited compliance-policy path for SENSITIVE global flags, as a command.
 * Sensitive flags have no admin toggle by design (constitution III and XI): an operator applies a
 * compliance decision (reference + approver) with `npm run ops:apply-flag-policy`, which goes
 * through `FeatureFlagsService.applyCompliancePolicy` (audit `feature_flag.policy_applied`).
 *
 * Only the flags whose validated spec defines this path can be switched on. Regulated modules
 * (payments, e-signature, policy issuance, claims, insurer API) are refused whatever the policy:
 * no validated spec activates them. Switching any known flag OFF is always accepted.
 */
export const POLICY_ACTIVATABLE_FLAGS = [
  "satisfaction_survey_enabled", // spec 048
  "billing_enabled", // spec 037 / 060
  "retention_purge_enabled", // spec 046
  "multi_broker_routing_enabled", // spec 042
  "partner_api_enabled", // spec 033
  "partner_webhooks_enabled", // spec 033
  "sms_enabled", // spec 038
  "whatsapp_enabled", // spec 038
  "ai_summary_enabled", // spec 035 / 036
  "ai_lead_scoring_enabled",
  "ai_duplicate_detection_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled",
  "ai_routing_anomaly_detection_enabled" // spec 049
] as const;

export const NEVER_ACTIVATABLE_FLAGS = ["payments_enabled", "e_signature_enabled", "policy_issuance_enabled", "claims_enabled", "insurer_api_enabled"] as const;

export const applyFlagPolicyInputSchema = z.object({
  flag: z.string().trim().refine((key) => key in GLOBAL_FEATURE_FLAG_DEFAULTS, { message: "unknown global flag" }),
  value: z.boolean(),
  reference: z.string().trim().min(3).max(120),
  approvedBy: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(8).max(500)
});

export type ApplyFlagPolicyInput = z.input<typeof applyFlagPolicyInputSchema>;

export class FlagPolicyRefusedError extends Error {
  constructor(readonly reason: string) {
    super(`Flag policy refused: ${reason}`);
  }
}

const OPS_ACTOR: ActorContext = { roles: ["super_admin"], mfaVerified: true, correlationId: "ops-apply-flag-policy" };

export async function applyFlagPolicy(flags: Pick<FeatureFlagsService, "applyCompliancePolicy" | "isEnabled">, input: ApplyFlagPolicyInput): Promise<{ flag: FeatureFlag; previousValue: boolean }> {
  const parsed = applyFlagPolicyInputSchema.safeParse(input);
  if (!parsed.success) throw new FlagPolicyRefusedError(`invalid_input: ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}`);
  const { flag, value, reference, approvedBy, reason } = parsed.data;
  if (value && (NEVER_ACTIVATABLE_FLAGS as readonly string[]).includes(flag)) throw new FlagPolicyRefusedError("regulated_module_without_validated_spec");
  if (value && !(POLICY_ACTIVATABLE_FLAGS as readonly string[]).includes(flag)) throw new FlagPolicyRefusedError("not_a_policy_activatable_flag");
  const previousValue = flags.isEnabled(flag);
  const updated = await flags.applyCompliancePolicy({ key: flag, scopeType: "global", value, reason }, OPS_ACTOR, { reference, approvedBy });
  return { flag: updated, previousValue };
}
