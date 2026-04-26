import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("feature flags OpenAPI contract", () => {
  const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");

  it("declares feature flag admin endpoints", async () => {
    expect(contract).toContain("/admin/feature-flags:");
    expect(contract).toContain("/admin/feature-flags/{id}:");
  });
});
