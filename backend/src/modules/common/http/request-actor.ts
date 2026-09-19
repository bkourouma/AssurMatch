import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";
import { actorFromHeaders, requireActor } from "./actor-context";
import type { ActorContext } from "../types";

export interface AssurMatchHttpRequest {
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  assurMatchActor?: ActorContext;
}

export function actorFromRequest(request: AssurMatchHttpRequest): ActorContext {
  return request.assurMatchActor ?? actorFromHeaders(request.headers);
}

export function protectedActorFromRequest(request: AssurMatchHttpRequest): ActorContext {
  return requireActor(actorFromRequest(request));
}

/**
 * Best-effort caller IP for public rate limiting. Only ever hashed before storage, never
 * persisted raw (constitution: no plain IP in evidence tables).
 */
export function clientIp(request: AssurMatchHttpRequest): string {
  const forwarded = (request as { headers?: Record<string, string | string[] | undefined> }).headers?.["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return first?.trim() || (request as { ip?: string }).ip || "unknown";
}

export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): ActorContext => {
  const request = context.switchToHttp().getRequest<AssurMatchHttpRequest>();
  return protectedActorFromRequest(request);
});
