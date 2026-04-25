import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("partners OpenAPI contract", () => {
  const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");

  it("declares partner, license and document endpoints", () => {
    expect(contract).toContain("/admin/partners:");
    expect(contract).toContain("/admin/partners/{partnerId}/licenses:");
    expect(contract).toContain("/admin/documents/{id}:");
  });
});
