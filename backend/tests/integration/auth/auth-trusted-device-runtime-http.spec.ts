import { afterEach, describe, expect, it } from "vitest";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { hashTrustedDeviceToken } from "../../../src/modules/auth/trusted-device.service";
import type { TrustedDevicesRepository } from "../../../src/modules/auth/trusted-devices.repository";
import { firstLoginWithEnrolment, httpLogin, httpVerifyMfa, jsonHeaders, loginWithCode } from "../helpers/mfa-login";
import { actorHeaders, createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const PASSWORD = "very-secure-pass";
const TENANT_ID = "00000000-0000-4000-8000-0000000000b9";
const adminActor = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };

describe("MFA bypass fix and trusted devices over the real HTTP runtime (spec 063)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const savedIdentifierMax = process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    if (savedIdentifierMax === undefined) delete process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX;
    else process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX = savedIdentifierMax;
  });

  async function brokerAccount(email: string) {
    const current = harness!;
    const created = await current.runtime.users.service.create({
      email,
      displayName: "Device Broker",
      roles: ["broker_owner_pro"],
      partnerTenantId: TENANT_ID,
      scopes: { countryIds: [], productIds: [] }
    }, adminActor);
    await current.runtime.users.service.setPassword(created.id, await current.runtime.auth.passwordHashing.hash(PASSWORD));
    await current.runtime.users.service.update({ ...(await current.runtime.users.service.require(created.id)), status: "active" });
    return created;
  }

  async function authed(path: string, accessToken: string, init: RequestInit = {}) {
    return harness!.request(path, { ...init, headers: { ...jsonHeaders(accessToken), ...(init.headers as Record<string, string> | undefined) } });
  }

  async function trustedBrokerSession(email: string) {
    const user = await brokerAccount(email);
    const first = await firstLoginWithEnrolment(harness!, email, PASSWORD);
    const login = await loginWithCode(harness!, email, PASSWORD, first.secret, { trustDevice: true, deviceLabel: "Chrome on Windows" });
    return { user, secret: first.secret, deviceToken: login.trustedDevice?.token ?? "", accessToken: login.accessToken };
  }

  it("A1/A2: password login asks for the code; a code with trustDevice returns the token once; the device skips the next code", async () => {
    harness = await createRuntimeHttpHarness();
    const user = await brokerAccount("device-flow@example.com");

    const passwordOnly = await httpLogin(harness, user.email, PASSWORD);
    expect(passwordOnly.status).toBeLessThan(400);
    expect(passwordOnly.body.mfaRequired).toBe(true);
    // A token without MFA reaches the authentication routes only.
    expect((await authed("/auth/trusted-devices", passwordOnly.body.accessToken)).status).toBe(403);
    expect((await authed("/broker/starter/leads", passwordOnly.body.accessToken)).status).toBe(403);
    const meBefore = await (await authed("/auth/me", passwordOnly.body.accessToken)).json() as { mfaEnrolled: boolean; actorId: string; mfaVerified: boolean };
    expect(meBefore).toMatchObject({ actorId: user.id, mfaEnrolled: false, mfaVerified: false });

    const enrolled = await authed("/auth/mfa/enroll", passwordOnly.body.accessToken, { method: "POST" });
    expect(enrolled.status).toBeLessThan(300);
    const { secret } = await enrolled.json() as { secret: string };
    const meAfterEnrol = await (await authed("/auth/me", passwordOnly.body.accessToken)).json() as { mfaEnrolled: boolean };
    expect(meAfterEnrol.mfaEnrolled).toBe(true);

    // First code without trusting the device: no device token.
    const plain = await httpVerifyMfa(harness, passwordOnly.body.accessToken, secret);
    expect(plain.status).toBeLessThan(300);
    expect(plain.body.trustedDevice).toBeUndefined();
    expect((await authed("/broker/starter/leads", plain.body.accessToken)).status).toBe(200);

    // Next login: the code is asked again although the status is "verified".
    const second = await httpLogin(harness, user.email, PASSWORD);
    expect(second.body.mfaRequired).toBe(true);
    expect((await authed("/broker/starter/leads", second.body.accessToken)).status).toBe(403);

    const trusted = await httpVerifyMfa(harness, second.body.accessToken, secret, { trustDevice: true, deviceLabel: "Chrome on Windows" });
    const deviceToken = trusted.body.trustedDevice?.token ?? "";
    expect(deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(trusted.body.trustedDevice?.expiresAt ?? "").getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);

    const withDevice = await httpLogin(harness, user.email, PASSWORD, deviceToken);
    expect(withDevice.body).toMatchObject({ mfaRequired: false, trustedDeviceUsed: true });
    expect(withDevice.body.trustedDeviceRejected).toBeUndefined();
    expect((await authed("/broker/starter/leads", withDevice.body.accessToken)).status).toBe(200);
    const meTrusted = await (await authed("/auth/me", withDevice.body.accessToken)).json() as { mfaVerified: boolean };
    expect(meTrusted.mfaVerified).toBe(true);

    // The list shows the device without any token material, and the token is never repeated.
    const listed = await (await authed("/auth/trusted-devices", withDevice.body.accessToken)).json() as Array<Record<string, unknown>>;
    expect(listed).toHaveLength(1);
    expect(Object.keys(listed[0] ?? {}).sort()).toEqual(["createdAt", "expiresAt", "id", "label", "lastUsedAt"]);
    expect(listed[0]).toMatchObject({ label: "Chrome on Windows" });
    expect(listed[0]?.lastUsedAt).toBeTruthy();
    expect(JSON.stringify(listed)).not.toContain(deviceToken);
    expect(JSON.stringify(withDevice.body)).not.toContain(deviceToken);

    const audit = harness.runtime.audit.writer;
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceCreated, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceUsed, targetId: user.id })).toHaveLength(1);
    expect(JSON.stringify(audit.search({}))).not.toContain(deviceToken);
  }, 120_000);

  it("A4: unknown, revoked, expired and foreign tokens give mfaRequired with the neutral flag only", async () => {
    harness = await createRuntimeHttpHarness();
    const owner = await trustedBrokerSession("device-owner@example.com");
    const stranger = await trustedBrokerSession("device-stranger@example.com");
    // Revoke the stranger's own device, craft an expired one.
    await authed("/auth/trusted-devices", stranger.accessToken, { method: "DELETE" });
    const expiredToken = "X".repeat(43);
    const repository = (harness.runtime as unknown as { trustedDevicesRepository: TrustedDevicesRepository }).trustedDevicesRepository;
    await repository.create({
      id: crypto.randomUUID(),
      userId: stranger.user.id,
      tokenHash: hashTrustedDeviceToken(expiredToken),
      label: null,
      createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() - 15 * 24 * 3600 * 1000),
      lastUsedAt: null,
      revokedAt: null,
      revokedReason: null
    });

    const bodies: string[] = [];
    for (const token of ["N".repeat(43), stranger.deviceToken, expiredToken, owner.deviceToken]) {
      const result = await httpLogin(harness, stranger.user.email, PASSWORD, token);
      expect(result.status).toBeLessThan(300);
      expect(result.body).toMatchObject({ mfaRequired: true, trustedDeviceRejected: true });
      expect(result.body.trustedDeviceUsed).toBeUndefined();
      expect((await authed("/auth/trusted-devices", result.body.accessToken)).status).toBe(403);
      bodies.push(JSON.stringify({ ...result.body, accessToken: "x", user: undefined }));
    }
    // No detail about the cause: the four responses are identical.
    expect(new Set(bodies).size).toBe(1);
    const causes = harness.runtime.audit.writer.search({ action: AuthAuditActions.userTrustedDeviceRejected, targetId: stranger.user.id }).map((entry) => entry.reason).sort();
    expect(causes).toEqual(["expired", "other_user", "revoked", "unknown"]);
    // The owner's device survived the stranger's attempts.
    expect((await httpLogin(harness, owner.user.email, PASSWORD, owner.deviceToken)).body.mfaRequired).toBe(false);
  }, 180_000);

  it("A3: a password change, an admin MFA reset and a suspension each end the trust", async () => {
    harness = await createRuntimeHttpHarness();
    const changing = await trustedBrokerSession("device-pwd@example.com");
    const resetting = await trustedBrokerSession("device-reset@example.com");
    const suspending = await trustedBrokerSession("device-suspend@example.com");
    const admin = actorHeaders(adminActor);

    const changed = await authed("/auth/password-change", changing.accessToken, { method: "POST", body: JSON.stringify({ oldPassword: PASSWORD, newPassword: "a brand new password 987" }) });
    expect(changed.status).toBeLessThan(300);
    const afterChange = await httpLogin(harness, changing.user.email, "a brand new password 987", changing.deviceToken);
    expect(afterChange.body).toMatchObject({ mfaRequired: true, trustedDeviceRejected: true });

    const mfaReset = await harness.request(`/admin/users/${resetting.user.id}/mfa-reset`, { method: "POST", headers: { ...admin, "content-type": "application/json" }, body: JSON.stringify({ reason: "Lost authenticator device" }) });
    expect(mfaReset.status).toBeLessThan(300);
    const afterReset = await httpLogin(harness, resetting.user.email, PASSWORD, resetting.deviceToken);
    expect(afterReset.body).toMatchObject({ mfaRequired: true, trustedDeviceRejected: true });

    const suspended = await harness.request(`/admin/users/${suspending.user.id}/suspend`, { method: "POST", headers: { ...admin, "content-type": "application/json" }, body: JSON.stringify({ reason: "Compliance requested suspension" }) });
    expect(suspended.status).toBeLessThan(300);
    const refused = await httpLogin(harness, suspending.user.email, PASSWORD, suspending.deviceToken);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    await harness.request(`/admin/users/${suspending.user.id}/unsuspend`, { method: "POST", headers: { ...admin, "content-type": "application/json" }, body: JSON.stringify({ reason: "Compliance approved reinstatement" }) });
    const afterUnsuspend = await httpLogin(harness, suspending.user.email, PASSWORD, suspending.deviceToken);
    expect(afterUnsuspend.body).toMatchObject({ mfaRequired: true, trustedDeviceRejected: true });

    const reasons = harness.runtime.audit.writer.search({ action: AuthAuditActions.userTrustedDeviceRevoked }).map((entry) => entry.reason).sort();
    expect(reasons).toEqual(["mfa_reset", "password_change", "suspended"]);
  }, 240_000);

  it("A5: a password-only token cannot re-enrol an enrolled account, a verified one can", async () => {
    harness = await createRuntimeHttpHarness();
    const user = await brokerAccount("device-enrol@example.com");
    const first = await firstLoginWithEnrolment(harness, user.email, PASSWORD);
    const storedBefore = (await harness.runtime.users.service.require(user.id)).mfaSecretEncrypted;
    expect(storedBefore).toBeTruthy();

    const passwordOnly = await httpLogin(harness, user.email, PASSWORD);
    const attack = await authed("/auth/mfa/enroll", passwordOnly.body.accessToken, { method: "POST" });
    expect(attack.status).toBe(403);
    expect(await attack.json()).toMatchObject({ code: "MFA_REQUIRED" });
    const afterAttack = await harness.runtime.users.service.require(user.id);
    expect(afterAttack.mfaSecretEncrypted).toBe(storedBefore);
    expect(afterAttack.mfaStatus).toBe("verified");
    const refusals = harness.runtime.audit.writer.search({ action: AuthAuditActions.userMfaEnrolled, targetId: user.id }).filter((entry) => entry.result === "refused");
    expect(refusals).toHaveLength(1);

    const reenrol = await authed("/auth/mfa/enroll", first.accessToken, { method: "POST" });
    expect(reenrol.status).toBeLessThan(300);
    const replaced = await harness.runtime.users.service.require(user.id);
    expect(replaced.mfaSecretEncrypted).not.toBe(storedBefore);
    expect(replaced.mfaStatus).toBe("enrolled");
  }, 120_000);

  it("A6: the user lists and revokes all of their devices; the next login asks for the code", async () => {
    harness = await createRuntimeHttpHarness();
    const session = await trustedBrokerSession("device-revoke@example.com");
    const second = await loginWithCode(harness, session.user.email, PASSWORD, session.secret, { trustDevice: true, deviceLabel: "Phone" });
    const third = await loginWithCode(harness, session.user.email, PASSWORD, session.secret, { trustDevice: true });
    const accessToken = third.accessToken;

    const listed = await (await authed("/auth/trusted-devices", accessToken)).json() as unknown[];
    expect(listed).toHaveLength(3);

    expect((await harness.request("/auth/trusted-devices", { method: "DELETE" })).status).toBe(401);
    const revoked = await authed("/auth/trusted-devices", accessToken, { method: "DELETE" });
    expect(revoked.status).toBeLessThan(300);
    expect(await revoked.json()).toEqual({ revoked: 3 });
    expect(await (await authed("/auth/trusted-devices", accessToken)).json()).toEqual([]);
    const audits = harness.runtime.audit.writer.search({ action: AuthAuditActions.userTrustedDeviceRevoked, targetId: session.user.id });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.context).toMatchObject({ reason: "user_request", count: 3 });

    for (const token of [session.deviceToken, second.trustedDevice?.token ?? "", third.trustedDevice?.token ?? ""]) {
      const result = await httpLogin(harness, session.user.email, PASSWORD, token);
      expect(result.body).toMatchObject({ mfaRequired: true, trustedDeviceRejected: true });
    }
  }, 180_000);

  it("A7: a valid device token with a wrong password fails and counts toward the lockout", async () => {
    harness = await createRuntimeHttpHarness();
    const session = await trustedBrokerSession("device-password@example.com");

    const wrong = await httpLogin(harness, session.user.email, "definitely the wrong one", session.deviceToken);

    expect(wrong.status).toBe(400); // existing mapping of "Invalid credentials"
    expect(wrong.body).not.toHaveProperty("accessToken");
    expect((await harness.runtime.users.service.require(session.user.id)).failedLoginCount).toBe(1);
    // The device itself is still valid afterwards.
    expect((await httpLogin(harness, session.user.email, PASSWORD, session.deviceToken)).body.mfaRequired).toBe(false);
  }, 120_000);

  it("the device login path shares the /auth/login rate limit", async () => {
    process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX = "2";
    harness = await createRuntimeHttpHarness();
    const session = await trustedBrokerSession("device-limit@example.com");

    expect((await httpLogin(harness, session.user.email, "wrong password one", session.deviceToken)).status).toBe(400);
    expect((await httpLogin(harness, session.user.email, "wrong password two", session.deviceToken)).status).toBe(400);
    // Blocked before the password or the device is even looked at.
    const blocked = await httpLogin(harness, session.user.email, PASSWORD, session.deviceToken);
    expect(blocked.status).toBe(429);
    expect(blocked.body).not.toHaveProperty("accessToken");
  }, 120_000);

  it("rejects a malformed trustedDeviceToken at validation without a session", async () => {
    harness = await createRuntimeHttpHarness();
    const user = await brokerAccount("device-malformed@example.com");

    const response = await harness.request("/auth/login", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: PASSWORD, trustedDeviceToken: "bad token!" }) });

    expect(response.status).toBe(400);
  }, 60_000);
});
