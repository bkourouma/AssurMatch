import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import { RolesService } from "./roles.service";
import { UsersService, type UserAccount } from "./users.module";

export class AdminUserRolesController {
  private readonly rbac = new RbacGuard();
  private readonly roles = new RolesService();

  constructor(private readonly users: UsersService, private readonly audit = new AuditLogWriter()) {}

  async updateRoles(actor: ActorContext, userId: string, roles: string[], reason: string): Promise<UserAccount> {
    const user = await this.users.require(userId);
    if (!this.canUpdateRoles(actor, user)) {
      this.audit.write({ actor, action: AuthAuditActions.userRoleChanged, targetType: "User", targetId: userId, result: "refused", reason, context: { roles } });
      throw new Error("RBAC denied");
    }
    roles.forEach((role) => this.roles.assertSystemRole(role));
    return this.users.updateRoles(userId, roles as AssurMatchRole[], reason, actor);
  }

  private canUpdateRoles(actor: ActorContext, user: UserAccount): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (actor.roles.includes("compliance_admin")) return true;
    if (actor.roles.includes("admin_pays")) {
      return user.countryScopes.length > 0 && user.countryScopes.every((countryId) => actor.countryScopes?.includes(countryId));
    }
    return this.rbac.can(actor, "users:update", user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {});
  }
}
