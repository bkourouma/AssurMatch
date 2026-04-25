import { describe, expect, it } from "vitest";
import { FeatureFlagPrecedenceService } from "../../../src/modules/feature-flags/feature-flag-precedence.service";

describe("feature flag precedence", () => {
  it("lets global disable override lower-scope enable", () => {
    const service = new FeatureFlagPrecedenceService();
    const enabled = service.resolve("country_public_enabled", [
      { key: "country_public_enabled", scopeType: "global", value: false },
      { key: "country_public_enabled", scopeType: "country", scopeId: "ci", value: true }
    ], [{ scopeType: "country", scopeId: "ci" }]);

    expect(enabled).toBe(false);
  });
});
