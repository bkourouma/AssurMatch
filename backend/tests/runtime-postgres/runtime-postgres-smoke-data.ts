import type { ActorContext } from "../../src/modules/common/types";
import { signActorToken } from "../../src/modules/auth/http-auth-token.service";

export interface RuntimeSmokeRun {
  id: string;
  prefix: string;
  correlationId: string;
  countryCode: string;
  productKey: string;
  email: string;
  phone: string;
}

export function createSmokeRun(explicitRunId?: string): RuntimeSmokeRun {
  const suffix = (explicitRunId ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
  const countryCode = suffix.slice(0, 2).toUpperCase().padEnd(2, "X");
  const id = `runtime-smoke-${suffix}`;
  return {
    id,
    prefix: `Runtime Smoke ${suffix}`,
    correlationId: `runtime-smoke-${suffix}`,
    countryCode,
    productKey: `runtime-smoke-${suffix}`,
    email: `runtime-smoke-${suffix}@example.test`,
    phone: "+2250102030405"
  };
}

export function authHeaders(actor: ActorContext): Record<string, string> {
  return {
    authorization: `Bearer ${signActorToken(actor)}`,
    ...(actor.correlationId ? { "x-correlation-id": actor.correlationId } : {})
  };
}

export function adminActor(run: RuntimeSmokeRun): ActorContext {
  return {
    actorId: `${run.id}-admin`,
    roles: ["super_admin"],
    mfaVerified: true,
    correlationId: run.correlationId
  };
}

export function starterActor(run: RuntimeSmokeRun, partnerTenantId: string, actorId: string): ActorContext {
  return {
    actorId,
    roles: ["broker_owner_starter"],
    partnerTenantId,
    partnerPlan: "starter",
    mfaVerified: true,
    correlationId: run.correlationId
  };
}

export function proActor(run: RuntimeSmokeRun, partnerTenantId: string): ActorContext {
  return {
    actorId: `${run.id}-pro-owner`,
    roles: ["broker_owner_pro"],
    partnerTenantId,
    partnerPlan: "pro",
    mfaVerified: true,
    correlationId: run.correlationId
  };
}
