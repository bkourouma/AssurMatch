import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";
import { actorFromHeaders, requireActor } from "./actor-context";
import type { ActorContext } from "../types";
import { trustedProxyHops } from "./trusted-proxy";

export { trustedProxyHops } from "./trusted-proxy";

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

function headerValues(value: string | string[] | undefined): string[] {
  const joined = Array.isArray(value) ? value.join(",") : value ?? "";
  return joined.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Caller IP for public rate limiting. Only ever hashed before storage, never persisted raw
 * (constitution: no plain IP in evidence tables).
 *
 * Each trusted proxy appends the address of whoever connected to it, so with N trusted hops the
 * client is the N-th entry from the right of `X-Forwarded-For`. The leftmost entry is whatever the
 * client chose to send and is never trusted on its own: taking it let anyone rotate a fake address
 * per request and walk around every per-IP limit.
 */
export function clientIp(request: AssurMatchHttpRequest, env: Record<string, string | undefined> = process.env): string {
  const hops = trustedProxyHops(env);
  const socketIp = (request as { ip?: string }).ip || (request as { socket?: { remoteAddress?: string } }).socket?.remoteAddress;
  if (hops > 0) {
    const headers = (request as { headers?: Record<string, string | string[] | undefined> }).headers ?? {};
    const forwarded = headerValues(headers["x-forwarded-for"]);
    if (forwarded.length > 0) return forwarded[Math.max(0, forwarded.length - hops)] as string;
    const realIp = headerValues(headers["x-real-ip"]);
    if (realIp.length > 0) return realIp[realIp.length - 1] as string;
  }
  return socketIp || "unknown";
}

export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): ActorContext => {
  const request = context.switchToHttp().getRequest<AssurMatchHttpRequest>();
  return protectedActorFromRequest(request);
});
