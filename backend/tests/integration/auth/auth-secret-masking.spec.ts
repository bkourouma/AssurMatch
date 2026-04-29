import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth secret and PII masking", () => {
  it("does not retain plain email or password in audit context on failed login", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const user = await users.create({ email: "mask@example.com", displayName: "Mask User", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(user.id, await auth.passwordHashing.hash("valid password 123"));

    await expect(auth.service.login({ email: user.email, password: "wrong password 123" })).rejects.toThrow();

    const serialized = JSON.stringify(audit.all());
    expect(serialized).not.toContain("mask@example.com");
    expect(serialized).not.toContain("wrong password 123");
  }, 20_000);
});
