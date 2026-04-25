import { describe, expect, it } from "vitest";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";

describe("regulated feature exclusions", () => {
  it("keeps forbidden regulated modules disabled by default", () => {
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.payments_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.e_signature_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.policy_issuance_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.claims_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.insurer_api_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.ai_recommendation_enabled).toBe(false);
  });
});
