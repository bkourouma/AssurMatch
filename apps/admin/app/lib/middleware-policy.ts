/**
 * Décision d'accès du middleware admin (module pur, testable en vitest).
 *
 * Une requête POST d'action serveur Next porte l'en-tête `next-action`. Redirigée vers /login, elle
 * produit « Une erreur est survenue ». On la laisse donc passer jusqu'à l'action, qui répond
 * « Session expirée : reconnectez-vous puis recommencez. » : sans jeton, `writeAdmin` & co refusent
 * avant tout appel d'écriture, et un jeton invalide est refusé (401) par le backend, qui reste l'autorité.
 */

export const ADMIN_ROLES: ReadonlySet<string> = new Set(["super_admin", "admin_pays", "compliance_admin", "support_admin", "finance_admin", "content_admin", "ai_admin"]);

export interface MiddlewareProfile {
  roles?: string[];
  mfaVerified?: boolean;
}

export type AuthOutcome =
  | { kind: "no_token" }
  | { kind: "api_status"; status: number }
  | { kind: "profile"; profile: MiddlewareProfile }
  | { kind: "unreachable" };

export type AccessDecision =
  | { type: "next" }
  | { type: "login"; reason: string }
  | { type: "access_denied" };

interface HeaderReader {
  get(name: string): string | null;
}

/** `Headers.get` est insensible à la casse ; on tolère aussi un lecteur qui ne l'est pas. */
export function isServerActionRequest(method: string, headers: HeaderReader | Record<string, string | undefined>): boolean {
  if (method.toUpperCase() !== "POST") return false;
  if (typeof (headers as HeaderReader).get === "function") {
    const reader = headers as HeaderReader;
    return (reader.get("next-action") ?? reader.get("Next-Action")) !== null;
  }
  return Object.keys(headers).some((name) => name.toLowerCase() === "next-action");
}

export function isAdminProfile(profile: MiddlewareProfile): boolean {
  return profile.roles?.some((role) => ADMIN_ROLES.has(role)) === true;
}

export function decideAccess(input: { isServerAction: boolean; outcome: AuthOutcome }): AccessDecision {
  const { outcome, isServerAction } = input;
  // Une action serveur n'est jamais redirigée pour un problème de session : elle affichera un message lisible.
  const redirectOrPass = (reason: string): AccessDecision => (isServerAction ? { type: "next" } : { type: "login", reason });

  switch (outcome.kind) {
    case "no_token":
      return redirectOrPass("session_required");
    case "unreachable":
      return redirectOrPass("auth_unavailable");
    case "api_status":
      return redirectOrPass(outcome.status === 401 ? "session_expired" : "session_invalid");
    case "profile":
      if (outcome.profile.mfaVerified !== true) return redirectOrPass("mfa_required");
      if (!isAdminProfile(outcome.profile)) return { type: "access_denied" };
      return { type: "next" };
  }
}
