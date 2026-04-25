import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("auth and user OpenAPI contract", () => {
  const contract = readFileSync("specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml", "utf8");

  it("declares auth, users and roles endpoints", () => {
    expect(contract).toContain("/auth/login:");
    expect(contract).toContain("/auth/mfa/enroll:");
    expect(contract).toContain("/admin/users:");
    expect(contract).toContain("/admin/roles:");
  });
});
