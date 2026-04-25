import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("consent and audit OpenAPI contract", () => {
  const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");

  it("declares consent and audit endpoints", () => {
    expect(contract).toContain("/admin/consent-texts:");
    expect(contract).toContain("/admin/consent-records:");
    expect(contract).toContain("/admin/audit-logs:");
  });
});
