import { ConflictException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { AssurMatchRoles, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { canChangeRoles, isCountryBoundAssigner } from "../../../../packages/shared/rbac/role-assignment-policy";
import type { ActorContext } from "../common/types";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import { RolesService } from "./roles.service";
import { UsersService, type UserAccount } from "./users.module";
import { toAdminUserView, type AdminUserView } from "./admin-user-view";

export class AdminUserRolesController {
  private readonly roles = new RolesService();

  constructor(private readonly users: UsersService, private readonly audit = new AuditLogWriter()) {}

  /**
   * Order of the checks: unknown role (400-class validation), RBAC / escalation (403), editing one's
   * own roles (409 SELF_ACTION_FORBIDDEN), last active super_admin (409 LAST_SUPER_ADMIN, in the service).
   */
  async updateRoles(actor: ActorContext, userId: string, roles: string[], reason: string): Promise<AdminUserView> {
    const user = await this.users.require(userId);
    roles.forEach((role) => this.roles.assertSystemRole(role));
    const nextRoles = roles as AssurMatchRole[];
    if (!this.canUpdateRoles(actor, user, nextRoles)) {
      this.audit.write({ actor, action: AuthAuditActions.userRoleChanged, targetType: "User", targetId: userId, result: "refused", reason, context: { roles, refusal: "role_assignment_not_allowed" } });
      throw new Error("RBAC denied");
    }
    if (actor.actorId && actor.actorId === userId) {
      this.audit.write({ actor, action: AuthAuditActions.userRoleChanged, targetType: "User", targetId: userId, result: "refused", reason, context: { roles, refusal: "self_action_forbidden" } });
      throw new ConflictException({ code: ErrorCodes.SELF_ACTION_FORBIDDEN, message: "You cannot change your own roles" });
    }
    return toAdminUserView(await this.users.updateRoles(userId, nextRoles, reason, actor));
  }

  /** SEC-ESC-1: every role that changes must be assignable by the actor; admin_pays stays inside its countries. */
  private canUpdateRoles(actor: ActorContext, user: UserAccount, nextRoles: AssurMatchRole[]): boolean {
    if (!canChangeRoles(actor.roles, user.roles, nextRoles, AssurMatchRoles)) return false;
    if (isCountryBoundAssigner(actor.roles)) {
      return user.countryScopes.length > 0 && user.countryScopes.every((countryId) => actor.countryScopes?.includes(countryId));
    }
    return true;
  }
}
