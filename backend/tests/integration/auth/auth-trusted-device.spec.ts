import { generate } from "otplib";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { verifyActorToken } from "../../../src/modules/auth/http-auth-token.service";
import { hashTrustedDeviceToken } from "../../../src/modules/auth/trusted-device.service";
import { MemoryTrustedDevicesRepository } from "../../../src/modules/auth/trusted-devices.repository";
import { PasswordResetService } from "../../../src/modules/auth/password-reset.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

const PASSWORD = "valid password 123";

async function code(secret: string): Promise<string> {
  return generate({ secret, strategy: "totp", digits: 6, period: 30 });
}

function harness() {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const repository = new MemoryTrustedDevicesRepository();
  const auth = new AuthModule(users, audit, undefined, undefined, repository);
  let counter = 0;

  /** An active account with a verified MFA enrolment, as after the first journey. */
  async function enrolledUser(roles: Array<"support_admin" | "broker_owner_pro"> = ["support_admin"]) {
    counter += 1;
    const created = await users.create({ email: `device-${counter}@example.com`, displayName: "Device User", roles }, superAdminActor);
    await users.setPassword(created.id, await auth.passwordHashing.hash(PASSWORD));
    await users.update({ ...(await users.require(created.id)), status: "active" });
    const enrollment = await auth.service.enrollMfa(await users.require(created.id));
    await auth.service.verifyMfa(await users.require(created.id), "", await code(enrollment.secret));
    return { user: await users.require(created.id), secret: enrollment.secret, backupCodes: enrollment.backupCodes };
  }

  /** Verifies a code with `trustDevice` and returns the clear device token. */
  async function trust(userId: string, secret: string, deviceLabel = "Test browser"): Promise<string> {
    const session = await auth.service.verifyMfa(await users.require(userId), "", await code(secret), "totp", { trustDevice: true, deviceLabel });
    const token = session.trustedDevice?.token;
    if (!token) throw new Error("No trusted device returned");
    return token;
  }

  return { audit, users, auth, repository, enrolledUser, trust };
}

describe("MFA login and trusted devices (spec 063, scenarios A1-A7)", () => {
  const previousThreshold = process.env.AUTH_LOCKOUT_THRESHOLD;
  afterEach(() => {
    if (previousThreshold === undefined) delete process.env.AUTH_LOCKOUT_THRESHOLD;
    else process.env.AUTH_LOCKOUT_THRESHOLD = previousThreshold;
  });

  it("A1: a password login of an enrolled account asks for the code and signs a token without MFA", async () => {
    const { auth, enrolledUser } = harness();
    const { user } = await enrolledUser();
    expect(user.mfaStatus).toBe("verified");

    const session = await auth.service.login({ email: user.email, password: PASSWORD });

    expect(session.mfaRequired).toBe(true);
    expect(session.trustedDeviceUsed).toBeUndefined();
    expect(session.trustedDeviceRejected).toBeUndefined();
    expect(verifyActorToken(session.accessToken).mfaVerified).toBe(false);
  }, 60_000);

  it("A1: a password login of a not yet enrolled account also asks for the second factor", async () => {
    const { auth, users } = harness();
    const created = await users.create({ email: "never-enrolled@example.com", displayName: "Never", roles: ["support_admin"] }, superAdminActor);
    await users.setPassword(created.id, await auth.passwordHashing.hash(PASSWORD));

    const session = await auth.service.login({ email: created.email, password: PASSWORD });

    expect(session.mfaRequired).toBe(true);
    expect(verifyActorToken(session.accessToken).mfaVerified).toBe(false);
  }, 60_000);

  it("A2: a valid code with trustDevice returns the device token once; the next login with it skips the code", async () => {
    const { audit, auth, repository, users, enrolledUser } = harness();
    const { user, secret } = await enrolledUser();

    const withoutTrust = await auth.service.verifyMfa(await users.require(user.id), "", await code(secret));
    expect(withoutTrust.trustedDevice).toBeUndefined();
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceCreated, targetId: user.id })).toHaveLength(0);

    const verified = await auth.service.verifyMfa(await users.require(user.id), "", await code(secret), "totp", { trustDevice: true, deviceLabel: "Chrome" });
    const token = verified.trustedDevice?.token ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(verified.trustedDevice?.expiresAt ?? "") - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(verified.mfaRequired).toBe(false);
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceCreated, targetId: user.id })).toHaveLength(1);
    // Only the hash is stored.
    expect(await repository.findByTokenHash(hashTrustedDeviceToken(token))).toMatchObject({ userId: user.id, label: "Chrome" });

    const relogin = await auth.service.login({ email: user.email, password: PASSWORD, trustedDeviceToken: token });
    expect(relogin.mfaRequired).toBe(false);
    expect(relogin.trustedDeviceUsed).toBe(true);
    expect(relogin.trustedDeviceRejected).toBeUndefined();
    expect(verifyActorToken(relogin.accessToken).mfaVerified).toBe(true);
    expect((await repository.findByTokenHash(hashTrustedDeviceToken(token)))?.lastUsedAt).toBeInstanceOf(Date);
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceUsed, targetId: user.id })).toHaveLength(1);
    expect(JSON.stringify(audit.search({}))).not.toContain(token);
  }, 60_000);

  it("A2: a wrong code with trustDevice creates no device", async () => {
    const { auth, repository, users, enrolledUser } = harness();
    const { user } = await enrolledUser();

    await expect(auth.service.verifyMfa(await users.require(user.id), "", "000000", "totp", { trustDevice: true })).rejects.toThrow(/Invalid MFA/);

    expect(await repository.listActiveForUser(user.id, new Date())).toEqual([]);
  }, 60_000);

  it("A4: unknown, revoked, expired and foreign tokens are refused with the same neutral response", async () => {
    const { audit, auth, repository, enrolledUser, trust } = harness();
    const owner = await enrolledUser();
    const stranger = await enrolledUser();
    const foreignToken = await trust(owner.user.id, owner.secret);
    const revokedToken = await trust(stranger.user.id, stranger.secret);
    await auth.trustedDevices.revokeAll(stranger.user.id, "user_request");
    const expiredToken = "E".repeat(43);
    await repository.create({
      id: crypto.randomUUID(),
      userId: stranger.user.id,
      tokenHash: hashTrustedDeviceToken(expiredToken),
      label: null,
      createdAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      lastUsedAt: null,
      revokedAt: null,
      revokedReason: null
    });

    for (const token of ["U".repeat(43), revokedToken, expiredToken, foreignToken]) {
      const session = await auth.service.login({ email: stranger.user.email, password: PASSWORD, trustedDeviceToken: token });
      expect(session.mfaRequired).toBe(true);
      expect(session.trustedDeviceRejected).toBe(true);
      expect(session.trustedDeviceUsed).toBeUndefined();
      expect(verifyActorToken(session.accessToken).mfaVerified).toBe(false);
    }

    const causes = audit.search({ action: AuthAuditActions.userTrustedDeviceRejected, targetId: stranger.user.id }).map((entry) => entry.reason);
    expect(causes.sort()).toEqual(["expired", "other_user", "revoked", "unknown"]);
    // The owner's device was not consumed by the stranger's attempt.
    const ownerLogin = await auth.service.login({ email: owner.user.email, password: PASSWORD, trustedDeviceToken: foreignToken });
    expect(ownerLogin.mfaRequired).toBe(false);

  }, 60_000);

  it("A7: a valid device token never replaces the password and the failure counts for the lockout", async () => {
    process.env.AUTH_LOCKOUT_THRESHOLD = "2";
    const { auth, users, enrolledUser, trust } = harness();
    const { user, secret } = await enrolledUser();
    const token = await trust(user.id, secret);

    await expect(auth.service.login({ email: user.email, password: "wrong password 123", trustedDeviceToken: token })).rejects.toThrow(/Invalid credentials/);
    expect((await users.require(user.id)).failedLoginCount).toBe(1);
    await expect(auth.service.login({ email: user.email, password: "wrong password 123", trustedDeviceToken: token })).rejects.toThrow(/Invalid credentials/);

    const locked = await users.require(user.id);
    expect(locked.status).toBe("locked");
    // Locking ends the trust.
    expect((await auth.trustedDevices.consume(user.id, token)).status).toBe("rejected");
  }, 60_000);

  describe("A3/A6: automatic revocation of every device", () => {
    const operations: Array<[string, string, (ctx: ReturnType<typeof harness>, user: { id: string; email: string }, secret: string) => Promise<void>]> = [
      ["password change", "password_change", async ({ auth, users }, user) => { await auth.service.changePassword({ actorId: user.id, roles: ["support_admin"], mfaVerified: true }, { oldPassword: PASSWORD, newPassword: "another valid password 456" }); void users; }],
      ["password reset", "password_reset", async ({ auth, users }, user) => {
        const issued = new PasswordResetService().issueToken();
        await users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
        await auth.service.resetPassword({ token: issued.token, newPassword: "reset valid password 789" });
      }],
      ["activation by password", "password_reset", async ({ auth, users }, user) => {
        const issued = new PasswordResetService().issueToken();
        await users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
        await auth.service.activate({ token: issued.token, password: "activated password 123" });
      }],
      ["MFA reset by an admin", "mfa_reset", async ({ users }, user) => { await users.resetMfa(user.id); }],
      ["MFA re-enrolment", "mfa_reenrolled", async ({ auth, users }, user) => { await auth.service.enrollMfa(await users.require(user.id), { mfaVerified: true }); }],
      ["manual lock", "locked", async ({ users }, user) => { await users.lock(user.id, "admin"); }],
      ["suspension", "suspended", async ({ users }, user) => { await users.suspend(user.id); }],
      ["broker team deactivation", "deactivated", async ({ users }, user) => { await users.suspend(user.id, "deactivated"); }],
      ["soft deletion", "deleted", async ({ users }, user) => { await users.softDelete(user.id); }],
      ["direct status update to suspended", "suspended", async ({ users }, user) => { await users.update({ ...(await users.require(user.id)), status: "suspended" }); }],
      ["direct update of the password hash", "password_change", async ({ users, auth }, user) => { await users.update({ ...(await users.require(user.id)), passwordHash: await auth.passwordHashing.hash("direct change password 1") }); }],
      ["direct update clearing the MFA secret", "mfa_reset", async ({ users }, user) => { const { mfaSecretEncrypted: _drop, ...rest } = await users.require(user.id); void _drop; await users.update(rest); }]
    ];

    for (const [label, reason, run] of operations) {
      it(`revokes all devices on ${label} (reason ${reason}) with a single audit entry`, async () => {
        const ctx = harness();
        const { user, secret } = await ctx.enrolledUser();
        const first = await ctx.trust(user.id, secret, "Laptop");
        const second = await ctx.trust(user.id, secret, "Phone");

        await run(ctx, user, secret);

        for (const token of [first, second]) {
          expect(await ctx.auth.trustedDevices.consume(user.id, token)).toEqual({ status: "rejected", cause: "revoked" });
        }
        const audits = ctx.audit.search({ action: AuthAuditActions.userTrustedDeviceRevoked, targetId: user.id });
        expect(audits).toHaveLength(1);
        expect(audits[0]?.context).toMatchObject({ reason, count: 2 });
        expect(await ctx.auth.trustedDevices.listActive(user.id)).toEqual([]);
      }, 60_000);
    }

    it("skips the revocation audit when the account had no device", async () => {
      const ctx = harness();
      const { user } = await ctx.enrolledUser();
      await ctx.users.suspend(user.id);
      expect(ctx.audit.search({ action: AuthAuditActions.userTrustedDeviceRevoked, targetId: user.id })).toHaveLength(0);
    }, 60_000);

    it("a revoked device makes the next login ask for the code again", async () => {
      const ctx = harness();
      const { user, secret } = await ctx.enrolledUser();
      const token = await ctx.trust(user.id, secret);
      await ctx.users.setPassword(user.id, await ctx.auth.passwordHashing.hash("new valid password 456"));

      const session = await ctx.auth.service.login({ email: user.email, password: "new valid password 456", trustedDeviceToken: token });

      expect(session.mfaRequired).toBe(true);
      expect(session.trustedDeviceRejected).toBe(true);
    }, 60_000);

    it("A6: a user revokes all of their devices on request, audited with the user_request reason", async () => {
      const ctx = harness();
      const { user, secret } = await ctx.enrolledUser();
      const other = await ctx.enrolledUser();
      const tokens = [await ctx.trust(user.id, secret), await ctx.trust(user.id, secret), await ctx.trust(user.id, secret)];
      const otherToken = await ctx.trust(other.user.id, other.secret);
      const actor = { actorId: user.id, roles: ["support_admin" as const], mfaVerified: true };

      expect(await ctx.auth.service.listTrustedDevices(actor)).toHaveLength(3);
      expect(await ctx.auth.service.revokeTrustedDevices(actor)).toEqual({ revoked: 3 });
      expect(await ctx.auth.service.listTrustedDevices(actor)).toEqual([]);

      const audits = ctx.audit.search({ action: AuthAuditActions.userTrustedDeviceRevoked, targetId: user.id });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: user.id });
      expect(audits[0]?.context).toMatchObject({ reason: "user_request", count: 3 });
      for (const token of tokens) {
        const session = await ctx.auth.service.login({ email: user.email, password: PASSWORD, trustedDeviceToken: token });
        expect(session.mfaRequired).toBe(true);
      }
      // Another user's devices are untouched.
      expect((await ctx.auth.service.login({ email: other.user.email, password: PASSWORD, trustedDeviceToken: otherToken })).mfaRequired).toBe(false);
    }, 120_000);
  });

  describe("A5: MFA enrolment cannot replace an existing secret without the second factor", () => {
    it("refuses a session without MFA when a secret exists, leaves the secret untouched and audits the refusal", async () => {
      const { audit, auth, users, enrolledUser } = harness();
      const { user } = await enrolledUser();
      const before = await users.require(user.id);

      for (const actor of [undefined, { mfaVerified: false }]) {
        await expect(auth.service.enrollMfa(before, actor)).rejects.toMatchObject({ status: 403, response: { code: "MFA_REQUIRED" } });
      }

      const after = await users.require(user.id);
      expect(after.mfaSecretEncrypted).toBe(before.mfaSecretEncrypted);
      expect(after.mfaBackupCodesHashes).toEqual(before.mfaBackupCodesHashes);
      expect(after.mfaStatus).toBe("verified");
      const refusals = audit.search({ action: AuthAuditActions.userMfaEnrolled, targetId: user.id }).filter((entry) => entry.result === "refused");
      expect(refusals).toHaveLength(2);
    }, 60_000);

    it("lets a never-enrolled account enrol with a password-only session", async () => {
      const { auth, users } = harness();
      const created = await users.create({ email: "first-enrol@example.com", displayName: "First", roles: ["support_admin"] }, superAdminActor);

      const enrollment = await auth.service.enrollMfa(await users.require(created.id), { mfaVerified: false });

      expect(enrollment.backupCodes).toHaveLength(8);
      expect((await users.require(created.id)).mfaStatus).toBe("enrolled");
    }, 60_000);

    it("lets a password-only session regenerate a secret that was never confirmed (no lock-out after an abandoned enrolment)", async () => {
      const { auth, users } = harness();
      const created = await users.create({ email: "abandoned-enrol@example.com", displayName: "Abandoned", roles: ["support_admin"] }, superAdminActor);
      const first = await auth.service.enrollMfa(await users.require(created.id), { mfaVerified: false });
      const second = await auth.service.enrollMfa(await users.require(created.id), { mfaVerified: false });
      expect(second.secret).not.toBe(first.secret);
      expect((await users.require(created.id)).mfaStatus).toBe("enrolled");
    }, 60_000);

    it("lets an MFA-verified session re-enrol: status goes back to enrolled and devices end", async () => {
      const { auth, users, enrolledUser, trust } = harness();
      const { user, secret } = await enrolledUser();
      const token = await trust(user.id, secret);

      const enrollment = await auth.service.enrollMfa(await users.require(user.id), { mfaVerified: true });

      const after = await users.require(user.id);
      expect(after.mfaStatus).toBe("enrolled");
      expect(enrollment.secret).not.toBe(secret);
      expect((await auth.trustedDevices.consume(user.id, token)).status).toBe("rejected");
      // The previous password-only token can no longer be used to log in without a code.
      const session = await auth.service.login({ email: user.email, password: PASSWORD });
      expect(session.mfaRequired).toBe(true);
    }, 60_000);
  });
});
