import { describe, expect, it } from "vitest";
import { MfaRequiredGuard } from "../../../src/modules/auth/guards/mfa-required.guard";

describe("MFA required guard", () => {
  it("requires MFA for sensitive admin actions", () => {
    const guard = new MfaRequiredGuard();
    expect(guard.requiresMfa("users:update")).toBe(true);
    expect(() => guard.assert({ roles: ["super_admin"] }, "users:update")).toThrow();
  });
});
