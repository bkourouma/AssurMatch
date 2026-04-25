import { roleHasPermission } from "../../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { ActorContext, ScopedResource } from "../../common/types";

export class RbacGuard {
  can(actor: ActorContext, permission: string, resource: ScopedResource = {}): boolean {
    if (actor.roles.some((role) => roleHasPermission(role, permission))) {
      return this.scopeAllows(actor, resource);
    }
    return false;
  }

  assert(actor: ActorContext, permission: string, resource: ScopedResource = {}): void {
    if (!this.can(actor, permission, resource)) {
      throw new Error("RBAC denied");
    }
  }

  private scopeAllows(actor: ActorContext, resource: ScopedResource): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (resource.partnerTenantId && actor.partnerTenantId && resource.partnerTenantId !== actor.partnerTenantId) return false;
    if (resource.countryId && actor.countryScopes?.length && !actor.countryScopes.includes(resource.countryId)) return false;
    if (resource.productId && actor.productScopes?.length && !actor.productScopes.includes(resource.productId)) return false;
    return true;
  }
}
