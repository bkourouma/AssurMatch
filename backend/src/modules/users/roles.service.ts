import { AssurMatchRoles, RolePermissions, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

export interface RoleDefinition {
  key: AssurMatchRole;
  permissions: string[];
  isSystemRole: true;
}

export class RolesService {
  list(): RoleDefinition[] {
    return AssurMatchRoles.map((role) => ({
      key: role,
      permissions: RolePermissions[role],
      isSystemRole: true
    }));
  }

  assertSystemRole(role: string): asserts role is AssurMatchRole {
    if (!AssurMatchRoles.includes(role as AssurMatchRole)) {
      throw new Error(`Unknown system role ${role}`);
    }
  }
}
