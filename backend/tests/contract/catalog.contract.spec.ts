import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("catalog OpenAPI contract", () => {
  const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");

  it("declares public and admin catalog endpoints", () => {
    expect(contract).toContain("/countries:");
    expect(contract).toContain("/products:");
    expect(contract).toContain("/admin/countries:");
    expect(contract).toContain("/admin/products:");
    expect(contract).toContain("/admin/regulatory-regimes:");
  });
});
