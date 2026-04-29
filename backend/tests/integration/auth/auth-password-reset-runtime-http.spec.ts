import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { PasswordResetService } from "../../../src/modules/auth/password-reset.service";
import { AdminUsersController } from "../../../src/modules/users/admin-users.controller";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth password reset flow", () => {
  it("issues, consumes and rejects reused or prior reset tokens", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const admin = new AdminUsersController(users, audit, auth.passwordReset);
    const user = await users.create({ email: "reset-user@example.com", displayName: "Reset User", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(user.id, await auth.passwordHashing.hash("old password 123"));
    await users.lock(user.id, "manual-test-lock");

    const prior = await admin.issuePasswordReset(superAdminActor, user.id, { reason: "First reset request for test" });
    const issued = await admin.issuePasswordReset(superAdminActor, user.id, { reason: "Second reset request for test" });

    await expect(auth.service.resetPassword({ token: prior.token ?? "", newPassword: "new reset password 123" })).rejects.toThrow(/Invalid password reset token/);
    await auth.service.resetPassword({ token: issued.token ?? "", newPassword: "new reset password 123" });

    const updated = await users.require(user.id);
    expect(updated.status).toBe("active");
    expect(updated.failedLoginCount).toBe(0);
    expect(updated.passwordResetTokenHash).toBeUndefined();
    expect(updated.lockedAt).toBeUndefined();
    expect(await auth.passwordHashing.verify(updated.passwordHash, "new reset password 123")).toBe(true);
    await expect(auth.service.resetPassword({ token: issued.token ?? "", newPassword: "another reset password 123" })).rejects.toThrow(/Invalid password reset token/);
    expect(audit.search({ action: AuthAuditActions.userPasswordResetIssued, targetId: user.id })).toHaveLength(2);
    expect(audit.search({ action: AuthAuditActions.userPasswordResetConsumed, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userPasswordResetInvalid })).toHaveLength(2);
  }, 30_000);

  it("rejects expired reset tokens without consuming them", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const reset = new PasswordResetService();
    const user = await users.create({ email: "expired-reset@example.com", displayName: "Expired Reset", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(user.id, await auth.passwordHashing.hash("old password 123"));
    const issued = reset.issueToken(new Date(Date.now() - 60 * 60 * 1000));
    await users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);

    await expect(auth.service.resetPassword({ token: issued.token, newPassword: "new reset password 123" })).rejects.toThrow(/Invalid password reset token/);

    expect((await users.require(user.id)).passwordResetTokenHash).toBe(issued.tokenHash);
    expect(await auth.passwordHashing.verify((await users.require(user.id)).passwordHash, "old password 123")).toBe(true);
    expect(audit.search({ action: AuthAuditActions.userPasswordResetInvalid, targetId: "unknown" })).toHaveLength(1);
  }, 20_000);
});
