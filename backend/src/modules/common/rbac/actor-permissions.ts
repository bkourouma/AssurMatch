import { brokerCustomPermissions } from "../../../../../packages/shared/contracts/enterprise.contracts";
import { roleHasPermission } from "../../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { ActorContext } from "../types";

/** Resources a tenant custom role can restrict (leads, CRM, notifications); everything else follows the base role. */
const CUSTOM_ROLE_RESOURCES: ReadonlySet<string> = new Set(brokerCustomPermissions.map((permission) => permission.split(":")[0] as string));

function resourceOf(permission: string): string {
  return permission.split(":")[0] as string;
}

/**
 * Spec 064 (FR-007): the one place where "does this actor hold this permission" is answered for
 * the broker catalogue. The base role must grant the permission; then, when a custom role restricts
 * the member (`customRolePermissions` set by the auth guard), a permission of the custom catalogue
 * is granted only if the effective list holds that exact permission. A resource wildcard such as
 * `broker_crm:*` is therefore refused under restriction (the catalogue has no wildcard), and a
 * custom role can never add a permission the base role lacks. Permissions outside the catalogue
 * (offers, company, team, billing) keep following the base role alone (decision D3).
 */
export function actorHasPermission(actor: ActorContext, permission: string): boolean {
  if (!actor.roles.some((role) => roleHasPermission(role, permission))) return false;
  return customRoleAllows(actor, permission);
}

/** True when at least one of the permissions is held (same rules as `actorHasPermission`). */
export function actorHasAnyPermission(actor: ActorContext, permissions: readonly string[]): boolean {
  return permissions.some((permission) => actorHasPermission(actor, permission));
}

/**
 * Only the custom-role part of the rule (no base role check): true when the actor has no custom
 * restriction, the permission is outside the restricted catalogue, or the effective list holds it.
 */
export function customRoleAllows(actor: ActorContext, permission: string): boolean {
  if (actor.customRolePermissions === undefined) return true;
  if (!CUSTOM_ROLE_RESOURCES.has(resourceOf(permission))) return true;
  return actor.customRolePermissions.includes(permission);
}
