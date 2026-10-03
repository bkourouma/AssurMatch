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
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { partnerUnprocessable } from "../partners/partner-errors";

/** Spec 051 R11: what user creation needs to know about the partner a user is attached to. */
export interface PartnerTenantLookup {
  find(id: string): Promise<{ id: string; status: string } | undefined>;
}

/** Spec 051 R11: a user created from the partner page (the caller has authorised the actor). */
export interface PartnerUserProvisionInput {
  email: string;
  displayName: string;
  role: AssurMatchRole;
  partnerTenantId: string;
  reason: string;
}

export function isBrokerRole(role: AssurMatchRole): boolean {
  return role.startsWith("broker_");
}

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
    private readonly notifications = new UserAuthNotificationService(),
    /** Spec 051 R11: left out (unit tests), the partner existence check is skipped. */
    private readonly partners?: PartnerTenantLookup
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
    await this.assertPartnerConsistency(actor, parsed.roles, parsed.partnerTenantId ?? undefined, parsed.email, parsed.reason);
    return this.provision(actor, {
      email: parsed.email,
      displayName: parsed.displayName,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      roles: parsed.roles,
      ...(parsed.partnerTenantId ? { partnerTenantId: parsed.partnerTenantId } : {}),
      scopes: parsed.scopes
    }, parsed.reason);
  }

  /**
   * Spec 051 FR-018: invitation from the partner page. The caller (`PartnerAdminService.inviteUser`)
   * has already authorised the actor and checked the role against the plan; the partner consistency
   * rules still apply here, then the existing activation path runs (token + activation e-mail).
   */
  async createPartnerUser(actor: ActorContext, input: PartnerUserProvisionInput): Promise<AdminUserCreateResponse> {
    await this.assertPartnerConsistency(actor, [input.role], input.partnerTenantId, input.email, input.reason);
    return this.provision(actor, {
      email: input.email,
      displayName: input.displayName,
      roles: [input.role],
      partnerTenantId: input.partnerTenantId,
      scopes: { countryIds: [], productIds: [] }
    }, input.reason);
  }

  private async provision(actor: ActorContext, input: Parameters<UsersService["create"]>[0], reason: string): Promise<AdminUserCreateResponse> {
    try {
      const user = await this.users.create(input, actor);
      const issued = this.passwordReset.issueToken();
      await this.users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
      const delivery = await this.notifications.deliverActivation(user, issued.token);
      return { user, ...delivery, expiresAt: issued.expiresAt };
    } catch (error) {
      this.audit.write({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason, context: { email: input.email } });
      throw error;
    }
  }

  /**
   * Spec 051 FR-019 / R11: a broker role needs an existing partner that is not retired; an admin
   * role is never attached to a partner. Refusals are audited and answered 422 with a code.
   */
  private async assertPartnerConsistency(actor: ActorContext, roles: AssurMatchRole[], partnerTenantId: string | undefined, email: string, reason: string): Promise<void> {
    const refuse = (refusal: string, code: string, message: string): never => {
      this.audit.write({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason, context: { email, roles, refusal, ...(partnerTenantId ? { partnerTenantId } : {}) } });
      throw partnerUnprocessable(code, message);
    };
    const brokerRoles = roles.filter(isBrokerRole);
    const adminRoles = roles.filter((role) => !isBrokerRole(role));
    if (brokerRoles.length > 0 && !partnerTenantId) refuse("broker_role_without_partner", ErrorCodes.PARTNER_USER_INVALID, "A broker role requires a partner");
    if (adminRoles.length > 0 && partnerTenantId) refuse("admin_role_with_partner", ErrorCodes.PARTNER_USER_INVALID, "A platform role cannot be attached to a partner");
    if (!partnerTenantId || !this.partners) return;
    const partner = await this.partners.find(partnerTenantId);
    if (!partner) refuse("partner_not_found", ErrorCodes.PARTNER_USER_INVALID, "The partner does not exist");
    if (partner?.status === "retired") refuse("partner_retired", ErrorCodes.PARTNER_RETIRED, "The partner is retired; no user can be attached to it");
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
