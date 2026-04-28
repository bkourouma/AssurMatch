import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth MFA runtime flow", () => {
  it("enrolls and verifies TOTP with audit", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const user = await users.create({ email: "mfa-flow@example.com", displayName: "MFA Flow", roles: ["support_admin"] }, superAdminActor);
    const auth = new AuthModule(users, audit);
    await users.setPassword(user.id, await auth.passwordHashing.hash("valid password 123"));

    const enrollment = await auth.service.enrollMfa(await users.require(user.id));
    const token = await generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30 });
    const session = await auth.service.verifyMfa(await users.require(user.id), "", token);
    const stored = await users.require(user.id);

    expect(session.mfaRequired).toBe(false);
    expect(stored.mfaStatus).toBe("verified");
    expect(stored.mfaSecretEncrypted).toBeTruthy();
    expect(stored.mfaSecretEncrypted).not.toBe(enrollment.secret);
    expect(stored).not.toHaveProperty("secret");
    expect(audit.search({ action: AuthAuditActions.userMfaEnrolled, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userMfaVerified, targetId: user.id })).toHaveLength(1);
  }, 30_000);

  it("consumes backup codes once and locks after repeated MFA failures", async () => {
    const previousThreshold = process.env.AUTH_LOCKOUT_THRESHOLD;
    process.env.AUTH_LOCKOUT_THRESHOLD = "2";
    try {
      const audit = new AuditLogWriter();
      const users = new UsersService(audit);
      const auth = new AuthModule(users, audit);
      const backupUser = await users.create({ email: "mfa-backup-flow@example.com", displayName: "MFA Backup", roles: ["support_admin"] }, superAdminActor);
      const lockedUser = await users.create({ email: "mfa-lock-flow@example.com", displayName: "MFA Lock", roles: ["support_admin"] }, superAdminActor);

      const backupEnrollment = await auth.service.enrollMfa(await users.require(backupUser.id));
      const backupSession = await auth.service.verifyMfa(await users.require(backupUser.id), "", backupEnrollment.backupCodes[0] ?? "", "backup");

      expect(backupSession.mfaRequired).toBe(false);
      expect((await users.require(backupUser.id)).mfaBackupCodesHashes[0]).toBe("");
      await expect(auth.service.verifyMfa(await users.require(backupUser.id), "", backupEnrollment.backupCodes[0] ?? "", "backup")).rejects.toThrow(/Invalid MFA/);

      await auth.service.enrollMfa(await users.require(lockedUser.id));
      await expect(auth.service.verifyMfa(await users.require(lockedUser.id), "", "000000")).rejects.toThrow(/Invalid MFA/);
      await expect(auth.service.verifyMfa(await users.require(lockedUser.id), "", "000000")).rejects.toThrow(/Invalid MFA/);

      expect((await users.require(lockedUser.id)).status).toBe("locked");
      expect((await users.require(lockedUser.id)).lockedReason).toBe("failed-mfa-threshold");
      expect(audit.search({ action: AuthAuditActions.userMfaFailed, targetId: lockedUser.id })).toHaveLength(2);
      expect(audit.search({ action: AuthAuditActions.userLockedAfterFailedLogins, targetId: lockedUser.id })).toHaveLength(1);
      expect(audit.search({ action: AuthAuditActions.userMfaVerified, targetId: backupUser.id })[0]?.context).toMatchObject({ kind: "backup" });
    } finally {
      if (previousThreshold === undefined) delete process.env.AUTH_LOCKOUT_THRESHOLD;
      else process.env.AUTH_LOCKOUT_THRESHOLD = previousThreshold;
    }
  }, 60_000);
});
