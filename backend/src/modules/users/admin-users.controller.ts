import type { AdminUserCreateRequest, AdminUserUpdateRequest, AdminUsersListQuery } from "../../../../packages/shared/contracts/user.contracts";
import { adminUserCreateRequestSchema, adminUsersListQuerySchema, adminUserUpdateRequestSchema } from "../../../../packages/shared/contracts/user.contracts";
import { reasonSchema } from "../../../../packages/shared/validation/common.schemas";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import { PasswordResetService } from "../auth/password-reset.service";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { UserAuthNotificationService, type AuthTokenDeliveryResult } from "../notifications/user-auth-notification.service";
import { UsersService, type UserAccount } from "./users.module";

export interface PasswordResetIssueResponse extends AuthTokenDeliveryResult {
  expiresAt: Date;
}

export interface AdminUserCreateResponse extends AuthTokenDeliveryResult {
  user: UserAccount;
  expiresAt: Date;
}

export class AdminUsersController {
  private readonly rbac = new RbacGuard();

  constructor(
    private readonly users: UsersService,
    private readonly audit = new AuditLogWriter(),
    private readonly passwordReset = new PasswordResetService(),
    private readonly notifications = new UserAuthNotificationService()
  ) {}

  async list(actor: ActorContext, query: AdminUsersListQuery = {}): Promise<UserAccount[]> {
    this.assertListActor(actor);
    const parsed = adminUsersListQuerySchema.parse(query);
    return (await this.users.list(actor)).filter((user) =>
      (!parsed.role || user.roles.includes(parsed.role)) &&
      (!parsed.status || user.status === parsed.status)
    );
  }

  async detail(actor: ActorContext, userId: string): Promise<UserAccount> {
    this.assertListActor(actor);
    const user = await this.users.require(userId);
    this.assertScope(actor, user);
    return user;
  }

  async create(actor: ActorContext, input: AdminUserCreateRequest): Promise<AdminUserCreateResponse> {
    const parsed = adminUserCreateRequestSchema.parse(input);
    if (!this.canCreate(actor, parsed.roles, parsed.scopes.countryIds, parsed.partnerTenantId ?? undefined)) {
      this.audit.write({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason: parsed.reason, context: { email: parsed.email, roles: parsed.roles } });
      throw new Error("RBAC denied");
    }
    try {
      const user = await this.users.create({
        email: parsed.email,
        displayName: parsed.displayName,
        ...(parsed.phone ? { phone: parsed.phone } : {}),
        roles: parsed.roles,
        ...(parsed.partnerTenantId ? { partnerTenantId: parsed.partnerTenantId } : {}),
        scopes: parsed.scopes
      }, actor);
      const issued = this.passwordReset.issueToken();
      await this.users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
      const delivery = await this.notifications.deliverActivation(user, issued.token);
      return { user, ...delivery, expiresAt: issued.expiresAt };
    } catch (error) {
      this.audit.write({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason: parsed.reason, context: { email: parsed.email } });
      throw error;
    }
  }

  async update(actor: ActorContext, userId: string, input: AdminUserUpdateRequest): Promise<UserAccount> {
    const parsed = adminUserUpdateRequestSchema.parse(input);
    const existing = await this.users.require(userId);
    if (!this.canUpdate(actor, existing, parsed.scopes?.countryIds)) {
      this.audit.write({ actor, action: AuthAuditActions.userUpdated, targetType: "User", targetId: userId, result: "refused", reason: parsed.reason, context: { email: existing.email } });
      throw new Error("RBAC denied");
    }
    const updated = await this.users.update({
      ...existing,
      ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      ...(parsed.scopes ? { countryScopes: parsed.scopes.countryIds, productScopes: parsed.scopes.productIds } : {})
    });
    this.audit.write({ actor, action: AuthAuditActions.userUpdated, targetType: "User", targetId: updated.id, result: "success", reason: parsed.reason, context: { email: updated.email } });
    return updated;
  }

  async issuePasswordReset(actor: ActorContext, userId: string, input: { reason: string }): Promise<PasswordResetIssueResponse> {
    const parsed = reasonSchema.parse(input.reason);
    this.assertLifecycleActor(actor);
    const user = await this.users.require(userId);
    const issued = this.passwordReset.issueToken();
    await this.users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
    const delivery = await this.notifications.deliverPasswordReset(user, issued.token);
    this.audit.write({
      actor,
      action: AuthAuditActions.userPasswordResetIssued,
      targetType: "User",
      targetId: user.id,
      result: "success",
      reason: parsed,
      context: { email: user.email, emailStatus: delivery.emailStatus }
    });
    return { ...delivery, expiresAt: issued.expiresAt };
  }

  async suspend(actor: ActorContext, userId: string, input: { reason: string }): Promise<UserAccount> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    const user = await this.users.suspend(userId);
    this.audit.write({ actor, action: AuthAuditActions.userSuspended, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return user;
  }

  async unsuspend(actor: ActorContext, userId: string, input: { reason: string }): Promise<UserAccount> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    const user = await this.users.unsuspend(userId);
    this.audit.write({ actor, action: AuthAuditActions.userUnsuspended, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return user;
  }

  async lock(actor: ActorContext, userId: string, input: { reason: string }): Promise<UserAccount> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    const user = await this.users.lock(userId, reason);
    this.audit.write({ actor, action: AuthAuditActions.userLocked, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return user;
  }

  async unlock(actor: ActorContext, userId: string, input: { reason: string }): Promise<UserAccount> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    const user = await this.users.unlock(userId);
    this.audit.write({ actor, action: AuthAuditActions.userUnlocked, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return user;
  }

  async resetMfa(actor: ActorContext, userId: string, input: { reason: string }): Promise<UserAccount> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    const user = await this.users.resetMfa(userId);
    this.audit.write({ actor, action: AuthAuditActions.userMfaReset, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return user;
  }

  async delete(actor: ActorContext, userId: string, input: { reason: string }): Promise<UserAccount> {
    const reason = this.parseReason(input);
    if (!actor.roles.includes("super_admin")) throw new Error("RBAC denied");
    const user = await this.users.softDelete(userId);
    this.audit.write({ actor, action: AuthAuditActions.userDeleted, targetType: "User", targetId: user.id, result: "success", reason, context: { tombstoneEmail: user.email } });
    return user;
  }

  private parseReason(input: { reason: string }): string {
    return reasonSchema.parse(input.reason);
  }

  private assertLifecycleActor(actor: ActorContext): void {
    if (!actor.roles.includes("super_admin") && !actor.roles.includes("compliance_admin")) throw new Error("RBAC denied");
  }

  private assertListActor(actor: ActorContext): void {
    if (this.rbac.can(actor, "users:read") || actor.roles.includes("admin_pays") || actor.partnerTenantId) return;
    throw new Error("RBAC denied");
  }

  private canCreate(actor: ActorContext, targetRoles: AssurMatchRole[], countryScopes: string[], partnerTenantId?: string): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (actor.roles.includes("admin_pays")) {
      return !targetRoles.includes("super_admin") &&
        countryScopes.length > 0 &&
        countryScopes.every((countryId) => actor.countryScopes?.includes(countryId));
    }
    if (actor.partnerTenantId && partnerTenantId === actor.partnerTenantId) return false;
    return false;
  }

  private canUpdate(actor: ActorContext, user: UserAccount, nextCountryScopes?: string[]): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (actor.roles.includes("compliance_admin")) return true;
    if (actor.roles.includes("admin_pays")) {
      const scopes = nextCountryScopes ?? user.countryScopes;
      return scopes.length > 0 && scopes.every((countryId) => actor.countryScopes?.includes(countryId));
    }
    return false;
  }

  private assertScope(actor: ActorContext, user: UserAccount): void {
    if (actor.roles.includes("super_admin")) return;
    if (actor.partnerTenantId && user.partnerTenantId === actor.partnerTenantId) return;
    if (user.countryScopes.some((countryId) => actor.countryScopes?.includes(countryId))) return;
    throw new Error("RBAC denied");
  }
}
