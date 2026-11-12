import { generate } from "otplib";
import { vi } from "vitest";
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

const lastTotpStep = new Map<string, number>();

/**
 * A TOTP code is single-use per account (replay guard): each call returns the code of the next
 * unused time step inside the accepted window (previous, current, next), so a test that verifies
 * several times with the same secret never replays a step.
 */
export async function totp(secret: string): Promise<string> {
  const current = Math.floor(Date.now() / 30_000);
  const step = Math.max(current - 1, (lastTotpStep.get(secret) ?? Number.NEGATIVE_INFINITY) + 1);
  if (step > current + 1) {
    // Window exhausted for this secret: move the (Date only) clock one step forward, as real time would.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 30_000 });
    return totp(secret);
  }
  lastTotpStep.set(secret, step);
  return generate({ secret, strategy: "totp", digits: 6, period: 30, epoch: step * 30 });
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
