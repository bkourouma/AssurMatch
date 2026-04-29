import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth password change flow", () => {
  it("changes password with old-password verification and audit", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const user = await users.create({ email: "change-password@example.com", displayName: "Change Password", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(user.id, await auth.passwordHashing.hash("current password 123"));

    await auth.service.changePassword({ actorId: user.id, roles: user.roles, mfaVerified: true }, {
      oldPassword: "current password 123",
      newPassword: "replacement password 123"
    });

    const updated = await users.require(user.id);
    expect(updated.passwordChangedAt).toBeInstanceOf(Date);
    expect(updated.passwordChangeRequired).toBe(false);
    expect(await auth.passwordHashing.verify(updated.passwordHash, "replacement password 123")).toBe(true);
    expect(audit.search({ action: AuthAuditActions.userPasswordChanged, targetId: user.id })).toHaveLength(1);
  }, 20_000);

  it("refuses wrong old passwords and policy failures with audit", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const user = await users.create({ email: "policy-change@example.com", displayName: "Policy Change", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(user.id, await auth.passwordHashing.hash("current password 123"));

    await expect(auth.service.changePassword({ actorId: user.id, roles: user.roles, mfaVerified: true }, {
      oldPassword: "not current password",
      newPassword: "replacement password 123"
    })).rejects.toThrow(/Invalid password/);

    await expect(auth.service.changePassword({ actorId: user.id, roles: user.roles, mfaVerified: true }, {
      oldPassword: "current password 123",
      newPassword: "password1234"
    })).rejects.toThrow(/too common/);

    expect(await auth.passwordHashing.verify((await users.require(user.id)).passwordHash, "current password 123")).toBe(true);
    expect(audit.search({ action: AuthAuditActions.userPasswordChangeFailed, targetId: user.id })).toHaveLength(2);
  }, 20_000);
});
