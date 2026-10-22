import { generate } from "otplib";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

const PASSWORD = "valid password 123";

async function enrolledAccount() {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const auth = new AuthModule(users, audit);
  const created = await users.create({ email: "lockout-mfa@example.com", displayName: "Lockout", roles: ["support_admin"] }, superAdminActor);
  await users.setPassword(created.id, await auth.passwordHashing.hash(PASSWORD));
  await users.update({ ...(await users.require(created.id)), status: "active" });
  const enrollment = await auth.service.enrollMfa(await users.require(created.id));
  const validCode = () => generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30 });
  await auth.service.verifyMfa(await users.require(created.id), "", await validCode());
  return { users, auth, user: await users.require(created.id), validCode };
}

describe("lockout counter and the pending second factor (spec 063)", () => {
  const previousThreshold = process.env.AUTH_LOCKOUT_THRESHOLD;
  afterEach(() => {
    if (previousThreshold === undefined) delete process.env.AUTH_LOCKOUT_THRESHOLD;
    else process.env.AUTH_LOCKOUT_THRESHOLD = previousThreshold;
  });

  it("a password login does not reset the counter while the code is pending: the threshold still locks the account", async () => {
    delete process.env.AUTH_LOCKOUT_THRESHOLD; // default 5
    const { users, auth, user } = await enrolledAccount();
    expect((await users.require(user.id)).failedLoginCount).toBe(0);

    await auth.service.login({ email: user.email, password: PASSWORD });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(auth.service.verifyMfa(await users.require(user.id), "", "000000")).rejects.toThrow(/Invalid MFA/);
    }
    expect((await users.require(user.id)).failedLoginCount).toBe(4);

    // The attacker logs in again with the password to try to clear the counter.
    const again = await auth.service.login({ email: user.email, password: PASSWORD });
    expect(again.mfaRequired).toBe(true);
    expect((await users.require(user.id)).failedLoginCount).toBe(4);
    expect((await users.require(user.id)).lastLoginAt).toBeInstanceOf(Date);

    await expect(auth.service.verifyMfa(await users.require(user.id), "", "000000")).rejects.toThrow(/Invalid MFA/);
    const locked = await users.require(user.id);
    expect(locked.status).toBe("locked");
    expect(locked.lockedReason).toBe("failed-mfa-threshold");
  }, 60_000);

  it("a valid code completes the login and clears the counter", async () => {
    const { users, auth, user, validCode } = await enrolledAccount();
    await auth.service.login({ email: user.email, password: PASSWORD });
    await expect(auth.service.verifyMfa(await users.require(user.id), "", "000000")).rejects.toThrow(/Invalid MFA/);
    expect((await users.require(user.id)).failedLoginCount).toBe(1);

    await auth.service.verifyMfa(await users.require(user.id), "", await validCode());

    expect((await users.require(user.id)).failedLoginCount).toBe(0);
  }, 60_000);

  it("a login completed by a trusted device clears the counter", async () => {
    const { users, auth, user, validCode } = await enrolledAccount();
    const trusted = await auth.service.verifyMfa(await users.require(user.id), "", await validCode(), "totp", { trustDevice: true });
    await expect(auth.service.verifyMfa(await users.require(user.id), "", "000000")).rejects.toThrow(/Invalid MFA/);
    expect((await users.require(user.id)).failedLoginCount).toBe(1);

    const session = await auth.service.login({ email: user.email, password: PASSWORD, trustedDeviceToken: trusted.trustedDevice?.token ?? "" });

    expect(session.mfaRequired).toBe(false);
    expect((await users.require(user.id)).failedLoginCount).toBe(0);
  }, 60_000);
});
