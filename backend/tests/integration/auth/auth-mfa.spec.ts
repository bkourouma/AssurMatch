import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth and MFA", () => {
  it("logs in, enrolls MFA and verifies challenge", () => {
    const users = new UsersService(new AuditLogWriter());
    const user = users.create({ email: "admin@example.com", displayName: "Admin", roles: ["super_admin"] }, superAdminActor);
    const auth = new AuthModule(users).service;
    const session = auth.login({ email: "admin@example.com", password: "very-secure-pass" });
    const challenge = auth.enrollMfa(user);
    const verified = auth.verifyMfa(user, challenge.challengeId, "123456");

    expect(session.mfaRequired).toBe(true);
    expect(verified.mfaRequired).toBe(false);
  });
});
