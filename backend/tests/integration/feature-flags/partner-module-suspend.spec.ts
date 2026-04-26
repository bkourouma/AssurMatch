import { describe, expect, it } from "vitest";
import { FeatureFlagPrecedenceService } from "../../../src/modules/feature-flags/feature-flag-precedence.service";

describe("partner and module suspension flags", () => {
  it("blocks module execution when module scope is disabled", async () => {
    const service = new FeatureFlagPrecedenceService();
    const enabled = service.resolve("multi_broker_routing_enabled", [
      { key: "multi_broker_routing_enabled", scopeType: "module", scopeId: "routing", value: false }
    ], [{ scopeType: "module", scopeId: "routing" }]);

    expect(enabled).toBe(false);
  });
});
