import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { PasswordResetService } from "../../../src/modules/auth/password-reset.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

async function setup(email: string, ttlOffsetMs = 0) {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const auth = new AuthModule(users, audit);
  const user = await users.create({ email, displayName: "Token User", roles: ["support_admin"] }, superAdminActor);
  const issued = new PasswordResetService().issueToken(new Date(Date.now() + ttlOffsetMs));
  await users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
  return { audit, users, auth, user, issued };
}

const INVALID_LINK = { response: { code: "INVALID_TOKEN", message: "Invalid or expired link" }, status: 400 };

describe("activation and reset tokens are single-use", () => {
  it("activates once, then refuses the same token with INVALID_TOKEN", async () => {
    const { users, auth, user, issued, audit } = await setup("activate-replay@example.com");
    await auth.service.activate({ token: issued.token, password: "a fine activation phrase 1" });
    expect((await users.require(user.id)).status).toBe("active");
    await expect(auth.service.activate({ token: issued.token, password: "another fine phrase 22" })).rejects.toMatchObject(INVALID_LINK);
    expect(audit.search({ action: AuthAuditActions.userPasswordResetInvalid })).toHaveLength(1);
  }, 30_000);

  it("refuses a reset token a second time", async () => {
    const { users, auth, user, issued } = await setup("reset-replay@example.com");
    await users.activateWithPassword(user.id, await auth.passwordHashing.hash("an initial phrase 123"));
    const reset = new PasswordResetService().issueToken();
    await users.setPasswordResetToken(user.id, reset.tokenHash, reset.expiresAt);
    await auth.service.resetPassword({ token: reset.token, newPassword: "brand new phrase 12345" });
    await expect(auth.service.resetPassword({ token: reset.token, newPassword: "yet another phrase 123" })).rejects.toMatchObject(INVALID_LINK);
    expect(issued.token).not.toBe(reset.token);
  }, 30_000);

  it("does not reactivate a locked or suspended account through an activation link", async () => {
    for (const status of ["locked", "suspended"] as const) {
      const { users, auth, user, issued } = await setup(`no-reactivate-${status}@example.com`);
      await users.activateWithPassword(user.id, await auth.passwordHashing.hash("an initial phrase 123"));
      const fresh = new PasswordResetService().issueToken();
      await users.setPasswordResetToken(user.id, fresh.tokenHash, fresh.expiresAt);
      if (status === "locked") await users.lock(user.id, "test");
      else await users.suspend(user.id);
      await expect(auth.service.activate({ token: fresh.token, password: "a fine activation phrase 1" })).rejects.toMatchObject(INVALID_LINK);
      expect((await users.require(user.id)).status).toBe(status);
      expect(issued.token).toBeTruthy();
    }
  }, 60_000);

  it("refuses an expired token and a forged one with the same answer", async () => {
    const { auth, issued } = await setup("expired-activation@example.com", -60 * 60 * 1000);
    await expect(auth.service.activate({ token: issued.token, password: "a fine activation phrase 1" })).rejects.toMatchObject(INVALID_LINK);
    await expect(auth.service.activate({ token: "forged-token-value-0123456789", password: "a fine activation phrase 1" })).rejects.toMatchObject(INVALID_LINK);
  }, 30_000);

  it("rejects a policy-violating password with PASSWORD_POLICY and keeps the token usable", async () => {
    const { auth, issued } = await setup("policy-activation@example.com");
    await expect(auth.service.activate({ token: issued.token, password: "password1234" })).rejects.toMatchObject({ status: 400, response: { code: "PASSWORD_POLICY" } });
    await expect(auth.service.activate({ token: issued.token, password: "a fine activation phrase 1" })).resolves.toBeTruthy();
  }, 30_000);
});
