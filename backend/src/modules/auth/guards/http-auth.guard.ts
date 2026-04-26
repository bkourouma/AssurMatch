import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { actorFromHeaders } from "../../common/http/actor-context";
import type { ActorContext } from "../../common/types";

interface HeaderCarrier {
  headers: Record<string, string | string[] | undefined>;
  assurMatchActor?: ActorContext;
}

export class AuthRequiredHttpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HeaderCarrier>();
    const actor = actorFromHeaders(request.headers);
    if (!actor.actorId || actor.roles.length === 0) throw new Error("Authentication required");
    request.assurMatchActor = actor;
    return true;
  }
}

export class MfaRequiredHttpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HeaderCarrier>();
    const actor = request.assurMatchActor ?? actorFromHeaders(request.headers);
    if (!actor.mfaVerified) throw new Error("MFA required");
    request.assurMatchActor = actor;
    return true;
  }
}

Injectable()(AuthRequiredHttpGuard);
Injectable()(MfaRequiredHttpGuard);
