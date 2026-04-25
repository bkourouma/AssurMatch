import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("foundation OpenAPI contract harness", () => {
  it("loads the OpenAPI contract and includes required top-level sections", () => {
    const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");
    expect(contract).toContain("openapi: 3.1.0");
    expect(contract).toContain("AssurMatch Foundation API");
    expect(contract).toContain("components:");
  });
});
