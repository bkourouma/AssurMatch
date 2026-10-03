import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ErrorCodes } from "../../../../../packages/shared/contracts/error-codes";
import { actorFromHeaders } from "../../common/http/actor-context";
import type { ActorContext } from "../../common/types";
import type { PartnerTenantStatusPort } from "../../partners/partner-tenant-status.service";

interface HeaderCarrier {
  headers: Record<string, string | string[] | undefined>;
  assurMatchActor?: ActorContext;
}

/** What the guard reads from the runtime it is constructed with (Nest injects `AssurMatchRuntime`). */
export interface AuthGuardRuntime {
  partnerTenantStatus?: PartnerTenantStatusPort;
}

export class AuthRequiredHttpGuard implements CanActivate {
  constructor(private readonly runtime?: AuthGuardRuntime) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HeaderCarrier>();
    const actor = actorFromHeaders(request.headers);
    if (!actor.actorId || actor.roles.length === 0) throw new Error("Authentication required");
    request.assurMatchActor = await this.withTenantStatus(actor);
    return true;
  }

  /**
   * Spec 051 R12, checked on every protected request: a user of a retired partner is answered 401
   * with a neutral message (existing tokens stop working although they are not individually
   * revocable); a user of a suspended partner is marked read-only for the broker write routes.
   */
  private async withTenantStatus(actor: ActorContext): Promise<ActorContext> {
    const tenantStatus = this.runtime?.partnerTenantStatus;
    if (!actor.partnerTenantId || !tenantStatus) return actor;
    const status = await tenantStatus.status(actor.partnerTenantId);
    if (!status) return actor;
    if (status === "retired") throw new UnauthorizedException({ code: ErrorCodes.AUTH_REQUIRED, message: "Authentication required" });
    return { ...actor, partnerTenantStatus: status, ...(status === "suspended" ? { tenantReadOnly: true } : {}) };
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
