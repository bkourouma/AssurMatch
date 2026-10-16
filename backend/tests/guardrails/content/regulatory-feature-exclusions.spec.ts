import { describe, expect, it } from "vitest";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";
import { isSensitiveFeatureFlagKey } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";

describe("regulated feature exclusions", () => {
  it("keeps forbidden regulated modules disabled by default", async () => {
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.payments_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.e_signature_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.policy_issuance_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.claims_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.insurer_api_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.ai_recommendation_enabled).toBe(false);
    // Spec 046: anonymization is irreversible, so executing a batch ships closed.
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.retention_purge_enabled).toBe(false);
  });

  it("ships every global flag OFF; the spec 062 messaging flag stays closed until the legal opinion L-08", async () => {
    const enabledByDefault = Object.entries(GLOBAL_FEATURE_FLAG_DEFAULTS).filter(([, value]) => (value as boolean) === true).map(([key]) => key);
    expect(enabledByDefault).toEqual([]);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.broker_visitor_messaging_enabled).toBe(false);
    // It must stay switchable from the flags screen: not sensitive, no protected listing.
    expect(isSensitiveFeatureFlagKey("broker_visitor_messaging_enabled")).toBe(false);
  });
});
