import type { AssurMatchRole } from "./assurmatch-role-matrix";

/**
 * Who may grant or withdraw which role (SEC-ESC-1). A role is assignable when it is strictly lower
 * than the actor's own: nobody grants a role equal or superior to theirs. `super_admin` is the only
 * actor that may grant or withdraw `super_admin`.
 */
const LOWER_ADMIN_ROLES: readonly AssurMatchRole[] = [
  "support_admin",
  "content_admin",
  "broker_owner_starter",
  "broker_owner_pro",
  "broker_manager",
  "broker_agent",
  "broker_read_only"
];

const ASSIGNABLE_BY_ROLE: Partial<Record<AssurMatchRole, readonly AssurMatchRole[]>> = {
  compliance_admin: LOWER_ADMIN_ROLES,
  admin_pays: LOWER_ADMIN_ROLES
};

/** Roles an actor holding `actorRoles` may grant or withdraw (union over its roles). */
export function assignableRolesFor(actorRoles: readonly AssurMatchRole[], allRoles: readonly AssurMatchRole[]): Set<AssurMatchRole> {
  if (actorRoles.includes("super_admin")) return new Set(allRoles);
  const assignable = new Set<AssurMatchRole>();
  for (const role of actorRoles) for (const target of ASSIGNABLE_BY_ROLE[role] ?? []) assignable.add(target);
  return assignable;
}

/** Roles whose assignment is limited to targets inside the actor's own countries. */
export function isCountryBoundAssigner(actorRoles: readonly AssurMatchRole[]): boolean {
  return !actorRoles.includes("super_admin") && !actorRoles.includes("compliance_admin") && actorRoles.includes("admin_pays");
}

/** Symmetric difference between the previous and the requested roles (the roles that really change). */
export function changedRoles(before: readonly AssurMatchRole[], after: readonly AssurMatchRole[]): AssurMatchRole[] {
  const previous = new Set(before);
  const next = new Set(after);
  return [...new Set([...before, ...after])].filter((role) => previous.has(role) !== next.has(role));
}

/** True when every role that changes is assignable by the actor; unchanged roles do not count. */
export function canChangeRoles(actorRoles: readonly AssurMatchRole[], before: readonly AssurMatchRole[], after: readonly AssurMatchRole[], allRoles: readonly AssurMatchRole[]): boolean {
  const isSuper = actorRoles.includes("super_admin");
  if (!isSuper && before.includes("super_admin")) return false;
  const assignable = assignableRolesFor(actorRoles, allRoles);
  return changedRoles(before, after).every((role) => assignable.has(role));
}

/** Creation of an account with these roles (nothing to compare against: every role counts). */
export function canCreateWithRoles(actorRoles: readonly AssurMatchRole[], roles: readonly AssurMatchRole[], allRoles: readonly AssurMatchRole[]): boolean {
  const assignable = assignableRolesFor(actorRoles, allRoles);
  return roles.length > 0 && roles.every((role) => assignable.has(role));
}
