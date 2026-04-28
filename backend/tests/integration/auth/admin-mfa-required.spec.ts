import { describe, expect, it } from "vitest";
import { MfaRequiredGuard } from "../../../src/modules/auth/guards/mfa-required.guard";

describe("admin MFA guard", () => {
  it("rejects authenticated actors without MFA verification", () => {
    const guard = new MfaRequiredGuard();
    expect(() => guard.assert({ roles: ["super_admin"], mfaVerified: false }, "users:create")).toThrow(/MFA/);
  });
});
