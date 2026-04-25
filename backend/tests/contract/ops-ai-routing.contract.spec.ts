import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ops, AI and routing OpenAPI contract", () => {
  const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");

  it("declares notifications, routing, AI and health endpoints", () => {
    expect(contract).toContain("/admin/notifications:");
    expect(contract).toContain("/admin/routing/precheck:");
    expect(contract).toContain("/admin/ai/modules:");
    expect(contract).toContain("/admin/system/health:");
  });
});
