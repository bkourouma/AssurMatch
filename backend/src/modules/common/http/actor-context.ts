import type { IncomingHttpHeaders } from "node:http";
import type { AssurMatchRole } from "../../../../../packages/shared/rbac/assurmatch-role-matrix";
import { verifyActorToken } from "../../auth/http-auth-token.service";
import type { ActorContext } from "../types";

function headerValue(headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function actorFromHeaders(headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>): ActorContext {
  const authorization = headerValue(headers, "authorization");
  if (authorization) {
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) throw new Error("Authentication invalid");
    const correlationId = headerValue(headers, "x-correlation-id");
    return { ...verifyActorToken(token), ...(correlationId ? { correlationId } : {}) };
  }
  if (!testSimulationHeadersAllowed()) return anonymousActor(headers);
  return actorFromSimulationHeaders(headers);
}

function actorFromSimulationHeaders(headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>): ActorContext {
  const actorId = headerValue(headers, "x-assurmatch-actor-id");
  const partnerTenantId = headerValue(headers, "x-assurmatch-partner-tenant-id");
  const partnerPlan = headerValue(headers, "x-assurmatch-partner-plan") as ActorContext["partnerPlan"] | undefined;
  const correlationId = headerValue(headers, "x-correlation-id");
  const roles = (headerValue(headers, "x-assurmatch-roles") ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean) as AssurMatchRole[];
  const countryScopes = (headerValue(headers, "x-assurmatch-country-scopes") ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const productScopes = (headerValue(headers, "x-assurmatch-product-scopes") ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  return {
    ...(actorId ? { actorId } : {}),
    roles,
    ...(partnerTenantId ? { partnerTenantId } : {}),
    ...(partnerPlan ? { partnerPlan } : {}),
    ...(countryScopes.length ? { countryScopes } : {}),
    ...(productScopes.length ? { productScopes } : {}),
    mfaVerified: headerValue(headers, "x-assurmatch-mfa-verified") === "true",
    ...(correlationId ? { correlationId } : {})
  };
}

function anonymousActor(headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>): ActorContext {
  const correlationId = headerValue(headers, "x-correlation-id");
  return {
    roles: [],
    ...(correlationId ? { correlationId } : {})
  };
}

export function testSimulationHeadersAllowed(): boolean {
  return process.env.NODE_ENV === "test" && process.env.ASSURMATCH_ALLOW_TEST_AUTH_HEADERS === "true";
}

export function requireActor(actor: ActorContext): ActorContext {
  if (!actor.actorId || actor.roles.length === 0) throw new Error("Authentication required");
  return actor;
}
