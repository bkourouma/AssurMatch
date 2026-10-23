import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ErrorCodes } from "../../../../../packages/shared/contracts/error-codes";
import { actorFromHeaders } from "../../common/http/actor-context";
import type { ActorContext } from "../../common/types";
import type { CustomRoleAccessPort } from "../../enterprise/custom-role-access-cache";
import type { PartnerTenantStatusPort } from "../../partners/partner-tenant-status.service";
import { userAccessRevoked, type UserAccessStatusPort } from "../user-access-status.service";

interface HeaderCarrier {
  headers: Record<string, string | string[] | undefined>;
  assurMatchActor?: ActorContext;
}

/** What the guard reads from the runtime it is constructed with (Nest injects `AssurMatchRuntime`). */
export interface AuthGuardRuntime {
  partnerTenantStatus?: PartnerTenantStatusPort;
  /** Spec 053 R6: the stored status and roles of a broker user (deactivation by the owner). */
  userAccessStatus?: UserAccessStatusPort;
  /** Spec 064: the custom role (if any) that restricts a broker member, resolved on every request. */
  customRoleAccess?: CustomRoleAccessPort;
}

export class AuthRequiredHttpGuard implements CanActivate {
  constructor(private readonly runtime?: AuthGuardRuntime) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HeaderCarrier>();
    const actor = actorFromHeaders(request.headers);
    if (!actor.actorId || actor.roles.length === 0) throw new Error("Authentication required");
    await this.assertUserAccess(actor);
    request.assurMatchActor = await this.withCustomRole(await this.withTenantStatus(actor));
    return true;
  }

  /**
   * Spec 053 R6 / FR-011: a broker user deactivated (or whose role changed) by the partner's owner
   * loses the access of a still valid token at the next request. An unknown user id (simulation
   * headers of the test runtime) is not restricted.
   */
  private async assertUserAccess(actor: ActorContext): Promise<void> {
    const port = this.runtime?.userAccessStatus;
    if (!actor.partnerTenantId || !actor.actorId || !port) return;
    const snapshot = await port.snapshot(actor.actorId);
    if (snapshot && userAccessRevoked(snapshot, actor.roles)) {
      throw new UnauthorizedException({ code: ErrorCodes.AUTH_REQUIRED, message: "Authentication required" });
    }
  }

  /**
   * Spec 064 (FR-007): the custom role of a broker member is read from the store on every request
   * (never from the token or a header) and put on the actor, so that the access policies and
   * `GET /auth/me` apply the intersection of the base role and the custom role. Any value present on
   * the actor before this point is dropped first. Fail closed: when the lookup fails, the request is
   * refused with the neutral 401 rather than served without the restriction the owner configured.
   */
  private async withCustomRole(actor: ActorContext): Promise<ActorContext> {
    const base: ActorContext = { ...actor };
    delete base.customRole;
    delete base.customRolePermissions;
    const port = this.runtime?.customRoleAccess;
    if (!port || !base.partnerTenantId || !base.actorId || !base.roles.some((role) => role.startsWith("broker_"))) return base;
    let resolved: Awaited<ReturnType<CustomRoleAccessPort["resolve"]>>;
    try {
      resolved = await port.resolve(base);
    } catch {
      throw new UnauthorizedException({ code: ErrorCodes.AUTH_REQUIRED, message: "Authentication required" });
    }
    if (!resolved) return base;
    return { ...base, customRole: { id: resolved.id, name: resolved.name }, customRolePermissions: [...resolved.permissions] };
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
