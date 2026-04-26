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

export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): ActorContext => {
  const request = context.switchToHttp().getRequest<AssurMatchHttpRequest>();
  return protectedActorFromRequest(request);
});
