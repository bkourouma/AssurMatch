import { createHmac, timingSafeEqual } from "node:crypto";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AssurMatchRoles } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { ActorContext } from "../common/types";

interface AuthTokenClaims {
  sub: string;
  roles: AssurMatchRole[];
  mfaVerified: boolean;
  partnerTenantId?: string;
  partnerPlan?: ActorContext["partnerPlan"];
  brokerUserTenantIds?: Record<string, string>;
  countryScopes?: string[];
  productScopes?: string[];
  correlationId?: string;
  iat: number;
  exp: number;
}

const TOKEN_HEADER = { alg: "HS256", typ: "JWT" };
const DEFAULT_TEST_SECRET = "assurmatch-runtime-test-secret-that-is-not-used-in-production";
const roleSet = new Set<string>(AssurMatchRoles);
const partnerPlanSet = new Set<string>(["starter", "pro", "enterprise"]);

function secret(): string {
  const configured = process.env.ASSURMATCH_AUTH_TOKEN_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "test") return DEFAULT_TEST_SECRET;
  throw new Error("Authentication token secret is not configured");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlJson(input: unknown): string {
  return base64UrlEncode(JSON.stringify(input));
}

function sign(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

function parseJsonSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    throw new Error("Authentication invalid");
  }
}

function assertValidClaims(claims: AuthTokenClaims): void {
  if (!claims.sub || !Array.isArray(claims.roles) || claims.roles.length === 0) throw new Error("Authentication invalid");
  if (!claims.roles.every((role) => roleSet.has(role))) throw new Error("Authentication invalid");
  if (typeof claims.mfaVerified !== "boolean") throw new Error("Authentication invalid");
  if (claims.partnerTenantId !== undefined && typeof claims.partnerTenantId !== "string") throw new Error("Authentication invalid");
  if (claims.partnerPlan !== undefined && !partnerPlanSet.has(claims.partnerPlan)) throw new Error("Authentication invalid");
  assertOptionalStringRecord(claims.brokerUserTenantIds);
  assertOptionalStringArray(claims.countryScopes);
  assertOptionalStringArray(claims.productScopes);
  if (claims.correlationId !== undefined && typeof claims.correlationId !== "string") throw new Error("Authentication invalid");
  if (!Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Authentication token expired");
}

function assertOptionalStringArray(value: string[] | undefined): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error("Authentication invalid");
}

function assertOptionalStringRecord(value: Record<string, string> | undefined): void {
  if (value === undefined) return;
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Authentication invalid");
  if (!Object.values(value).every((item) => typeof item === "string")) throw new Error("Authentication invalid");
}

export function signActorToken(actor: ActorContext, ttlSeconds = 900): string {
  if (!actor.actorId || actor.roles.length === 0) throw new Error("Authentication invalid");
  const now = Math.floor(Date.now() / 1000);
  const claims: AuthTokenClaims = {
    sub: actor.actorId,
    roles: actor.roles,
    mfaVerified: actor.mfaVerified === true,
    ...(actor.partnerTenantId ? { partnerTenantId: actor.partnerTenantId } : {}),
    ...(actor.partnerPlan ? { partnerPlan: actor.partnerPlan } : {}),
    ...(actor.brokerUserTenantIds ? { brokerUserTenantIds: actor.brokerUserTenantIds } : {}),
    ...(actor.countryScopes ? { countryScopes: actor.countryScopes } : {}),
    ...(actor.productScopes ? { productScopes: actor.productScopes } : {}),
    ...(actor.correlationId ? { correlationId: actor.correlationId } : {}),
    iat: now,
    exp: now + ttlSeconds
  };
  const unsigned = `${base64UrlJson(TOKEN_HEADER)}.${base64UrlJson(claims)}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyActorToken(token: string): ActorContext {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) throw new Error("Authentication invalid");
  const header = parseJsonSegment<typeof TOKEN_HEADER>(encodedHeader);
  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("Authentication invalid");
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = sign(unsigned);
  const actualBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Authentication invalid");
  }
  const claims = parseJsonSegment<AuthTokenClaims>(encodedPayload);
  assertValidClaims(claims);
  return {
    actorId: claims.sub,
    roles: claims.roles,
    mfaVerified: claims.mfaVerified,
    ...(claims.partnerTenantId ? { partnerTenantId: claims.partnerTenantId } : {}),
    ...(claims.partnerPlan ? { partnerPlan: claims.partnerPlan } : {}),
    ...(claims.brokerUserTenantIds ? { brokerUserTenantIds: claims.brokerUserTenantIds } : {}),
    ...(claims.countryScopes ? { countryScopes: claims.countryScopes } : {}),
    ...(claims.productScopes ? { productScopes: claims.productScopes } : {}),
    ...(claims.correlationId ? { correlationId: claims.correlationId } : {})
  };
}
