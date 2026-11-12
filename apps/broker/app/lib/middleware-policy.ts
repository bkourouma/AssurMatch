/**
 * Decision logic of `middleware.ts`, kept pure so it can be unit tested.
 *
 * A Next.js server action is a POST carrying the `next-action` header. The browser client cannot
 * follow a redirect answered to such a request: it shows the generic error page and the typed text
 * is lost. Without a valid session the request is therefore let through to the action, which
 * refuses to write anything ("Session expirée : reconnectez-vous puis recommencez.") because no
 * token is forwarded to the API (or the API answers 401). Page navigations keep the redirects.
 */

export interface MiddlewareProfile {
  roles?: string[];
  partnerPlan?: string;
  mfaVerified?: boolean;
}

export type MiddlewareDecision =
  | { type: "next" }
  | { type: "login"; reason: string }
  | { type: "access_denied" }
  | { type: "starter_crm" };

/** `Headers.get` is case-insensitive, so `Next-Action` and `next-action` are both recognised. */
export function isServerActionRequest(method: string, headers: { get(name: string): string | null }): boolean {
  return method.toUpperCase() === "POST" && headers.get("next-action") !== null;
}

export function isBrokerProfile(profile: MiddlewareProfile): boolean {
  return profile.roles?.some((role) => role.startsWith("broker_")) === true;
}

export function isStarterCrmDenied(profile: MiddlewareProfile, pathname: string): boolean {
  const isStarterProfile = profile.partnerPlan === "starter" || profile.roles?.includes("broker_owner_starter") === true;
  if (!isStarterProfile) return false;

  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPathname === "/crm") return false;

  return normalizedPathname.startsWith("/crm/");
}

/** Step 1, before any API call: is there a session cookie at all? */
export function decideWithoutProfile(input: { isAction: boolean; hasToken: boolean }): MiddlewareDecision | { type: "check_profile" } {
  if (input.hasToken) return { type: "check_profile" };
  return input.isAction ? { type: "next" } : { type: "login", reason: "session_required" };
}

export type MeOutcome =
  | { kind: "unreachable" }
  | { kind: "status"; status: number }
  | { kind: "profile"; profile: MiddlewareProfile };

/**
 * Step 2, from the answer of `/auth/me`. For a server action, an expired, invalid or unreachable
 * session is not redirected (the action answers with the session message); a known profile that is
 * not allowed (MFA missing, not a broker, Starter on the CRM) is still refused here.
 */
export function decideFromMe(input: { isAction: boolean; pathname: string; me: MeOutcome }): MiddlewareDecision {
  const { isAction, pathname, me } = input;
  if (me.kind === "unreachable") return isAction ? { type: "next" } : { type: "login", reason: "auth_unavailable" };
  if (me.kind === "status") {
    if (isAction) return { type: "next" };
    return { type: "login", reason: me.status === 401 ? "session_expired" : "session_invalid" };
  }
  const profile = me.profile;
  if (profile.mfaVerified !== true) return { type: "login", reason: "mfa_required" };
  if (!isBrokerProfile(profile)) return { type: "access_denied" };
  if (isStarterCrmDenied(profile, pathname)) return { type: "starter_crm" };
  return { type: "next" };
}
