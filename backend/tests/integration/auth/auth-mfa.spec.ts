import { describe, expect, it } from "vitest";
import { generate } from "otplib";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth and MFA", () => {
  it("logs in, enrolls MFA and verifies challenge", async () => {
    const users = new UsersService(new AuditLogWriter());
    const user = await users.create({ email: "admin@example.com", displayName: "Admin", roles: ["super_admin"] }, superAdminActor);
    const auth = new AuthModule(users).service;
    const passwordHash = await new AuthModule(users).passwordHashing.hash("very-secure-pass");
    await users.setPassword(user.id, passwordHash);
    const session = await auth.login({ email: "admin@example.com", password: "very-secure-pass" });
    const challenge = await auth.enrollMfa(user);
    const token = await generate({ secret: challenge.secret, strategy: "totp", digits: 6, period: 30 });
    const verified = await auth.verifyMfa(await users.require(user.id), "", token);

    expect(session.mfaRequired).toBe(true);
    expect(verified.mfaRequired).toBe(false);
  });
});
