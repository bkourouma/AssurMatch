import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("auth lockout counter", () => {
  it("locks after the configured failed-login threshold", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const user = await users.create({ email: "lockout@example.com", displayName: "Lockout User", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(user.id, await auth.passwordHashing.hash("valid password 123"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(auth.service.login({ email: user.email, password: "wrong password 123" })).rejects.toThrow(/Invalid credentials/);
    }

    expect((await users.require(user.id)).status).toBe("locked");
    expect((await users.require(user.id)).lockedReason).toBe("failed-login-threshold");
  }, 30_000);
});
