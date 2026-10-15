import { generate } from "otplib";
import type { RuntimeHttpHarness } from "../runtime-http-test-utils";

/** Spec 063: what a client receives from `POST /auth/login` and `POST /auth/mfa/verify`. */
export interface HttpAuthSession {
  accessToken: string;
  mfaRequired: boolean;
  trustedDeviceUsed?: boolean;
  trustedDeviceRejected?: boolean;
  trustedDevice?: { token: string; expiresAt: string };
  user?: Record<string, unknown>;
}

export function jsonHeaders(accessToken?: string): Record<string, string> {
  return { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) };
}

export async function totp(secret: string): Promise<string> {
  return generate({ secret, strategy: "totp", digits: 6, period: 30 });
}

export async function httpLogin(harness: RuntimeHttpHarness, email: string, password: string, trustedDeviceToken?: string): Promise<{ status: number; body: HttpAuthSession }> {
  const response = await harness.request("/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, ...(trustedDeviceToken ? { trustedDeviceToken } : {}) })
  });
  return { status: response.status, body: await response.json() as HttpAuthSession };
}

export async function httpVerifyMfa(harness: RuntimeHttpHarness, accessToken: string, secret: string, extra: Record<string, unknown> = {}): Promise<{ status: number; body: HttpAuthSession }> {
  const response = await harness.request("/auth/mfa/verify", {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({ code: await totp(secret), kind: "totp", ...extra })
  });
  return { status: response.status, body: await response.json() as HttpAuthSession };
}

/**
 * Spec 063: the real first-login journey of an account that has never enrolled MFA - password
 * login, enrolment, first code - and the session it ends with (`mfaVerified=true`).
 */
export async function firstLoginWithEnrolment(harness: RuntimeHttpHarness, email: string, password: string, extra: Record<string, unknown> = {}): Promise<{ accessToken: string; secret: string; session: HttpAuthSession }> {
  const login = await httpLogin(harness, email, password);
  if (login.status >= 400 || !login.body.mfaRequired) throw new Error(`Unexpected login result ${login.status}`);
  const enrolled = await harness.request("/auth/mfa/enroll", { method: "POST", headers: jsonHeaders(login.body.accessToken) });
  const { secret } = await enrolled.json() as { secret: string };
  const verified = await httpVerifyMfa(harness, login.body.accessToken, secret, extra);
  return { accessToken: verified.body.accessToken, secret, session: verified.body };
}

/** Spec 063: login of an already enrolled account, completed with a fresh code. */
export async function loginWithCode(harness: RuntimeHttpHarness, email: string, password: string, secret: string, extra: Record<string, unknown> = {}): Promise<HttpAuthSession> {
  const login = await httpLogin(harness, email, password);
  return (await httpVerifyMfa(harness, login.body.accessToken, secret, extra)).body;
}
