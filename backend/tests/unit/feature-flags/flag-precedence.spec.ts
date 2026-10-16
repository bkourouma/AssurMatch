import { describe, expect, it } from "vitest";
import { FeatureFlagPrecedenceService } from "../../../src/modules/feature-flags/feature-flag-precedence.service";

describe("feature flag precedence", () => {
  it("lets global disable override lower-scope enable", async () => {
    const service = new FeatureFlagPrecedenceService();
    const enabled = service.resolve("country_public_enabled", [
      { key: "country_public_enabled", scopeType: "global", value: false },
      { key: "country_public_enabled", scopeType: "country", scopeId: "ci", value: true }
    ], [{ scopeType: "country", scopeId: "ci" }]);

    expect(enabled).toBe(false);
  });

  it("falls back to the code default when a global flag has no row (spec 062 messaging switch ships OFF)", async () => {
    const service = new FeatureFlagPrecedenceService();
    expect(service.resolve("broker_visitor_messaging_enabled", [], [])).toBe(false);
    expect(service.resolve("broker_visitor_messaging_enabled", [{ key: "broker_visitor_messaging_enabled", scopeType: "global", value: true }], [])).toBe(true);
    expect(service.resolve("starter_portal_enabled", [], [])).toBe(false);
    expect(service.resolve("unknown_flag", [], [])).toBe(false);
  });
});
