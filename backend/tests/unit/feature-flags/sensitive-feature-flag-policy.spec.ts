import { describe, expect, it } from "vitest";
import { evaluateFeatureFlagMutation, isSensitiveFeatureFlagKey, sensitiveFeatureFlagRefusalReason } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";

describe("sensitive feature flag mutation policy", () => {
  it("identifies regulated and sensitive AI flags as protected", () => {
    const protectedKeys = [
      "payments_enabled",
      "e_signature_enabled",
      "policy_issuance_enabled",
      "claims_enabled",
      "insurer_api_enabled",
      "ai_recommendation_enabled",
      "ai_lead_scoring_enabled",
      "ai_duplicate_detection_enabled",
      "ai_broker_assistant_enabled",
      "multi_broker_routing_enabled",
      "future_premium_collection_enabled",
      "future_insurer_webhook_enabled"
    ];

    for (const key of protectedKeys) expect(isSensitiveFeatureFlagKey(key)).toBe(true);
    expect(isSensitiveFeatureFlagKey("ai_summary_enabled")).toBe(false);
    expect(isSensitiveFeatureFlagKey("public_comparator_enabled")).toBe(false);
  });

  it("refuses generic mutations for protected flags without an explicit policy", () => {
    for (const value of [true, false]) {
      const decision = evaluateFeatureFlagMutation({ key: "payments_enabled", scopeType: "global", value });
      expect(decision.allowed).toBe(false);
      if (decision.allowed) throw new Error("protected flag mutation should be refused");
      expect(decision.reason).toBe(sensitiveFeatureFlagRefusalReason);
    }
  });

  it("allows only explicit rapid-disable policy writes to false", () => {
    expect(evaluateFeatureFlagMutation({ key: "payments_enabled", scopeType: "global", value: false, allowSensitiveDisable: true })).toEqual({ allowed: true });
    expect(evaluateFeatureFlagMutation({ key: "payments_enabled", scopeType: "global", value: true, allowSensitiveDisable: true }).allowed).toBe(false);
  });
});
