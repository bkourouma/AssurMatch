import type { AdminUserCreateRequest, AdminUserUpdateRequest, AdminUsersListQuery } from "../../../../packages/shared/contracts/user.contracts";
import { adminUserCreateRequestSchema, adminUsersListQuerySchema, adminUserUpdateRequestSchema } from "../../../../packages/shared/contracts/user.contracts";
import { reasonSchema } from "../../../../packages/shared/validation/common.schemas";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AssurMatchRoles, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { canCreateWithRoles } from "../../../../packages/shared/rbac/role-assignment-policy";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import { PasswordResetService } from "../auth/password-reset.service";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { UserAuthNotificationService, exposeAuthTokensInResponse, type AuthTokenDeliveryResult } from "../notifications/user-auth-notification.service";
import { UsersService, type UserAccount } from "./users.module";
import { toAdminUserView, type AdminUserView } from "./admin-user-view";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { partnerUnprocessable } from "../partners/partner-errors";

/** Spec 051 R11: what user creation needs to know about the partner a user is attached to. */
export interface PartnerTenantLookup {
  find(id: string): Promise<{ id: string; status: string; countryId?: string | null | undefined } | undefined>;
}

/** Spec 051 R11: a user created from the partner page (the caller has authorised the actor). */
export interface PartnerUserProvisionInput {
  email: string;
  displayName: string;
  role: AssurMatchRole;
  partnerTenantId: string;
  reason: string;
}

/** Defence in depth: whatever the notification service returned, production never answers with a token. */
function withoutTokenInProduction(delivery: AuthTokenDeliveryResult): AuthTokenDeliveryResult {
  if (exposeAuthTokensInResponse() || delivery.token === undefined) return delivery;
  const rest = { ...delivery };
  delete rest.token;
  return rest;
}

export function isBrokerRole(role: AssurMatchRole): boolean {
  return role.startsWith("broker_");
}

export interface PasswordResetIssueResponse extends AuthTokenDeliveryResult {
  expiresAt: Date;
}

/**
 * `AdminUserView` on the HTTP surface (`create`); the internal door (`createPartnerUser`) keeps the
 * default `UserAccount` for the in-process callers (partner admin, broker team).
 */
export interface AdminUserCreateResponse<U = UserAccount> extends AuthTokenDeliveryResult {
  user: U;
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

  async list(actor: ActorContext, query: AdminUsersListQuery = {}): Promise<AdminUserView[]> {
    this.assertListActor(actor);
    const parsed = adminUsersListQuerySchema.parse(query);
    return (await this.users.list(actor))
      .filter((user) =>
        (!parsed.role || user.roles.includes(parsed.role)) &&
        (!parsed.status || user.status === parsed.status)
      )
      .map(toAdminUserView);
  }

  async detail(actor: ActorContext, userId: string): Promise<AdminUserView> {
    this.assertListActor(actor);
    const user = await this.users.require(userId);
    this.assertScope(actor, user);
    return toAdminUserView(user);
  }

  async create(actor: ActorContext, input: AdminUserCreateRequest): Promise<AdminUserCreateResponse<AdminUserView>> {
    const parsed = adminUserCreateRequestSchema.parse(input);
    if (!this.canCreate(actor, parsed.roles, parsed.scopes.countryIds, parsed.partnerTenantId ?? undefined)) {
      await this.audit.writeAsync({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason: parsed.reason, context: { email: parsed.email, roles: parsed.roles } });
      throw new Error("RBAC denied");
    }
    await this.assertPartnerConsistency(actor, parsed.roles, parsed.partnerTenantId ?? undefined, parsed.email, parsed.reason);
    const created = await this.provision(actor, {
      email: parsed.email,
      displayName: parsed.displayName,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      roles: parsed.roles,
      ...(parsed.partnerTenantId ? { partnerTenantId: parsed.partnerTenantId } : {}),
      scopes: parsed.scopes
    }, parsed.reason);
    return { ...created, user: toAdminUserView(created.user) };
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
      const delivery = await this.notifications.deliverActivation(user, issued.token, issued.expiresAt);
      return { user, ...withoutTokenInProduction(delivery), expiresAt: issued.expiresAt };
    } catch (error) {
      await this.audit.writeAsync({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason, context: { email: input.email } });
      throw error;
    }
  }

  /**
   * Spec 051 FR-019 / R11: a broker role needs an existing partner that is not retired; an admin
   * role is never attached to a partner. Refusals are audited and answered 422 with a code.
   */
  private async assertPartnerConsistency(actor: ActorContext, roles: AssurMatchRole[], partnerTenantId: string | undefined, email: string, reason: string): Promise<void> {
    const refuse = (refusal: string, code: string, message: string): never => {
      this.audit.write(/* Lot 8: sync closure, stays on the outbox */ { actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason, context: { email, roles, refusal, ...(partnerTenantId ? { partnerTenantId } : {}) } });
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
    // Same rule as `PartnerAdminService.inCountryScope`: a country-bound actor (admin_pays) reaches
    // only partners of its own countries, and never a partner without a country.
    if (partner && !actor.roles.includes("super_admin") && actor.roles.includes("admin_pays") && actor.countryScopes?.length &&
      !(partner.countryId && actor.countryScopes.includes(partner.countryId))) {
      this.audit.write({ actor, action: AuthAuditActions.userCreated, targetType: "User", targetId: "refused", result: "refused", reason, context: { email, roles, refusal: "partner_out_of_country_scope", partnerTenantId } });
      throw new ForbiddenException({ code: ErrorCodes.RBAC_DENIED, message: "The partner is outside your country scope" });
    }
  }

  async update(actor: ActorContext, userId: string, input: AdminUserUpdateRequest): Promise<AdminUserView> {
    const parsed = adminUserUpdateRequestSchema.parse(input);
    const existing = await this.users.require(userId);
    if (!this.canUpdate(actor, existing, parsed.scopes?.countryIds)) {
      await this.audit.writeAsync({ actor, action: AuthAuditActions.userUpdated, targetType: "User", targetId: userId, result: "refused", reason: parsed.reason, context: { email: existing.email } });
      throw new Error("RBAC denied");
    }
    const updated = await this.users.update({
      ...existing,
      ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      ...(parsed.scopes ? { countryScopes: parsed.scopes.countryIds, productScopes: parsed.scopes.productIds } : {})
    });
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userUpdated, targetType: "User", targetId: updated.id, result: "success", reason: parsed.reason, context: { email: updated.email } });
    return toAdminUserView(updated);
  }

  async issuePasswordReset(actor: ActorContext, userId: string, input: { reason: string }): Promise<PasswordResetIssueResponse> {
    const parsed = reasonSchema.parse(input.reason);
    this.assertLifecycleActor(actor);
    const user = await this.users.require(userId);
    await this.assertLifecycleTarget(actor, user, AuthAuditActions.userPasswordResetIssued, parsed);
    const issued = this.passwordReset.issueToken();
    await this.users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);
    const delivery = await this.notifications.deliverPasswordReset(user, issued.token, issued.expiresAt);
    await this.audit.writeAsync({
      actor,
      action: AuthAuditActions.userPasswordResetIssued,
      targetType: "User",
      targetId: user.id,
      result: "success",
      reason: parsed,
      context: { email: user.email, emailStatus: delivery.emailStatus }
    });
    return { ...withoutTokenInProduction(delivery), expiresAt: issued.expiresAt };
  }

  async suspend(actor: ActorContext, userId: string, input: { reason: string }): Promise<AdminUserView> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    await this.assertLifecycleTarget(actor, await this.users.require(userId), AuthAuditActions.userSuspended, reason, true);
    const user = await this.users.suspend(userId);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userSuspended, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return toAdminUserView(user);
  }

  async unsuspend(actor: ActorContext, userId: string, input: { reason: string }): Promise<AdminUserView> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    await this.assertLifecycleTarget(actor, await this.users.require(userId), AuthAuditActions.userUnsuspended, reason);
    const user = await this.users.unsuspend(userId);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userUnsuspended, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return toAdminUserView(user);
  }

  async lock(actor: ActorContext, userId: string, input: { reason: string }): Promise<AdminUserView> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    await this.assertLifecycleTarget(actor, await this.users.require(userId), AuthAuditActions.userLocked, reason, true);
    const user = await this.users.lock(userId, reason);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userLocked, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return toAdminUserView(user);
  }

  async unlock(actor: ActorContext, userId: string, input: { reason: string }): Promise<AdminUserView> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    await this.assertLifecycleTarget(actor, await this.users.require(userId), AuthAuditActions.userUnlocked, reason);
    const user = await this.users.unlock(userId);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userUnlocked, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return toAdminUserView(user);
  }

  async resetMfa(actor: ActorContext, userId: string, input: { reason: string }): Promise<AdminUserView> {
    const reason = this.parseReason(input);
    this.assertLifecycleActor(actor);
    await this.assertLifecycleTarget(actor, await this.users.require(userId), AuthAuditActions.userMfaReset, reason);
    const user = await this.users.resetMfa(userId);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userMfaReset, targetType: "User", targetId: user.id, result: "success", reason, context: { email: user.email } });
    return toAdminUserView(user);
  }

  async delete(actor: ActorContext, userId: string, input: { reason: string }): Promise<AdminUserView> {
    const reason = this.parseReason(input);
    if (!actor.roles.includes("super_admin")) throw new Error("RBAC denied");
    this.refuseSelfAction(actor, userId, AuthAuditActions.userDeleted, reason);
    const user = await this.users.softDelete(userId);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userDeleted, targetType: "User", targetId: user.id, result: "success", reason, context: { tombstoneEmail: user.email } });
    return toAdminUserView(user);
  }

  private parseReason(input: { reason: string }): string {
    return reasonSchema.parse(input.reason);
  }

  private assertLifecycleActor(actor: ActorContext): void {
    if (!actor.roles.includes("super_admin") && !actor.roles.includes("compliance_admin")) throw new Error("RBAC denied");
  }

  /**
   * A broker user (or any actor attached to a partner) never reads the platform user directory: the
   * broker team goes through `/broker/team`.
   */
  private assertListActor(actor: ActorContext): void {
    if (actor.partnerTenantId || actor.roles.some(isBrokerRole)) throw new Error("RBAC denied");
    if (this.rbac.can(actor, "users:read") || actor.roles.includes("admin_pays")) return;
    throw new Error("RBAC denied");
  }

  /**
   * Account of a super_admin: only a super_admin acts on it (403). Self-protection (409
   * SELF_ACTION_FORBIDDEN) comes after the permission check; the last-super-admin guard (409) is in
   * the service. Refusals are audited.
   */
  private async assertLifecycleTarget(actor: ActorContext, target: UserAccount, auditAction: string, reason: string, selfForbidden = false): Promise<void> {
    if (target.roles.includes("super_admin") && !actor.roles.includes("super_admin")) {
      await this.audit.writeAsync({ actor, action: auditAction, targetType: "User", targetId: target.id, result: "refused", reason, context: { refusal: "super_admin_target" } });
      throw new Error("RBAC denied");
    }
    if (selfForbidden) this.refuseSelfAction(actor, target.id, auditAction, reason);
  }

  private refuseSelfAction(actor: ActorContext, targetId: string, auditAction: string, reason: string): void {
    if (!actor.actorId || actor.actorId !== targetId) return;
    this.audit.write({ actor, action: auditAction, targetType: "User", targetId, result: "refused", reason, context: { refusal: "self_action_forbidden" } });
    throw new ConflictException({ code: ErrorCodes.SELF_ACTION_FORBIDDEN, message: "You cannot perform this action on your own account" });
  }

  private canCreate(actor: ActorContext, targetRoles: AssurMatchRole[], countryScopes: string[], partnerTenantId?: string): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (actor.roles.includes("admin_pays")) {
      return canCreateWithRoles(actor.roles, targetRoles, AssurMatchRoles) &&
        countryScopes.length > 0 &&
        countryScopes.every((countryId) => actor.countryScopes?.includes(countryId));
    }
    if (actor.partnerTenantId && partnerTenantId === actor.partnerTenantId) return false;
    return false;
  }

  private canUpdate(actor: ActorContext, user: UserAccount, nextCountryScopes?: string[]): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (user.roles.includes("super_admin")) return false;
    if (actor.roles.includes("compliance_admin")) return true;
    if (actor.roles.includes("admin_pays")) {
      const scopes = nextCountryScopes ?? user.countryScopes;
      return scopes.length > 0 && scopes.every((countryId) => actor.countryScopes?.includes(countryId));
    }
    return false;
  }

  private assertScope(actor: ActorContext, user: UserAccount): void {
    if (actor.roles.includes("super_admin")) return;
    if (user.countryScopes.some((countryId) => actor.countryScopes?.includes(countryId))) return;
    throw new Error("RBAC denied");
  }
}
