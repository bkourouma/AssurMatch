import { afterEach, describe, expect, it } from "vitest";
import { PasswordResetService } from "../../../src/modules/auth/password-reset.service";
import { firstLoginWithEnrolment, httpLogin, httpVerifyMfa, jsonHeaders } from "../helpers/mfa-login";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const FORBIDDEN_FIELDS = [
  "passwordHash",
  "mfaBackupCodesHashes",
  "mfaSecretEncrypted",
  "mfaSecretIssuedAt",
  "passwordResetTokenHash",
  "passwordResetTokenExpiresAt",
  "lastLoginIpHash",
  "failedLoginCount",
  "lockedReason"
];
const ALLOWED_USER_FIELDS = ["id", "email", "phone", "displayName", "roles", "status", "mfaStatus", "partnerTenantId", "partnerPlan", "countryScopes", "productScopes", "createdAt", "updatedAt", "lastLoginAt"];

describe("session responses expose a safe user view (spec 063)", () => {
  let harness: RuntimeHttpHarness | undefined;
  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  function expectSafe(user: Record<string, unknown> | undefined, serialized: string) {
    expect(user).toBeDefined();
    for (const field of FORBIDDEN_FIELDS) {
      expect(Object.keys(user ?? {}), field).not.toContain(field);
      expect(serialized, field).not.toContain(`"${field}"`);
    }
    for (const key of Object.keys(user ?? {})) expect(ALLOWED_USER_FIELDS, key).toContain(key);
    expect(serialized).not.toContain("$argon2");
  }

  it("login, mfa verify and activate never return hashes, the MFA secret, backup codes or reset tokens", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };
    const created = await harness.runtime.users.service.create({
      email: "session-view@example.com",
      displayName: "Session View",
      roles: ["broker_owner_pro"],
      partnerTenantId: "00000000-0000-4000-8000-0000000000b8",
      scopes: { countryIds: [], productIds: [] }
    }, admin);
    await harness.runtime.users.service.setPassword(created.id, await harness.runtime.auth.passwordHashing.hash("very-secure-pass"));

    const login = await harness.request("/auth/login", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ email: created.email, password: "very-secure-pass" }) });
    const loginText = await login.text();
    const loginBody = JSON.parse(loginText) as { user: Record<string, unknown>; accessToken: string };
    expectSafe(loginBody.user, loginText);
    expect(loginBody.user).toMatchObject({ id: created.id, email: created.email, displayName: "Session View", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000b8" });

    const enrolled = await harness.request("/auth/mfa/enroll", { method: "POST", headers: jsonHeaders(loginBody.accessToken) });
    const { secret } = await enrolled.json() as { secret: string };
    const verify = await httpVerifyMfa(harness, loginBody.accessToken, secret);
    expectSafe(verify.body.user, JSON.stringify(verify.body));

    const relogin = await httpLogin(harness, created.email, "very-secure-pass");
    expectSafe(relogin.body.user, JSON.stringify(relogin.body));

    const issued = new PasswordResetService().issueToken();
    await harness.runtime.users.service.setPasswordResetToken(created.id, issued.tokenHash, issued.expiresAt);
    const activate = await harness.request("/auth/activate", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ token: issued.token, password: "activated password 123" }) });
    const activateText = await activate.text();
    expect(activate.status).toBeLessThan(300);
    expectSafe((JSON.parse(activateText) as { user: Record<string, unknown> }).user, activateText);
  }, 120_000);

  it("the first-login helper still completes (enrol then verify) with the reduced view", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };
    const created = await harness.runtime.users.service.create({ email: "session-view-2@example.com", displayName: "V2", roles: ["support_admin"] }, admin);
    await harness.runtime.users.service.setPassword(created.id, await harness.runtime.auth.passwordHashing.hash("very-secure-pass"));
    const result = await firstLoginWithEnrolment(harness, created.email, "very-secure-pass");
    expect(result.session.mfaRequired).toBe(false);
    expect(result.session.user).toMatchObject({ mfaStatus: "verified" });
  }, 60_000);
});
