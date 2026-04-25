import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { RolesService } from "./roles.service";
import { UsersService, type UserAccount } from "./users.module";

export class AdminUserRolesController {
  private readonly rbac = new RbacGuard();
  private readonly roles = new RolesService();

  constructor(private readonly users: UsersService) {}

  updateRoles(actor: ActorContext, userId: string, roles: string[], reason: string): UserAccount {
    this.rbac.assert(actor, "users:update");
    roles.forEach((role) => this.roles.assertSystemRole(role));
    return this.users.updateRoles(userId, roles as AssurMatchRole[], reason, actor);
  }
}
