import {
  brokerTeamActionSchema,
  brokerTeamInviteSchema,
  brokerTeamRoleChangeSchema,
  type BrokerTeamInviteResult,
  type BrokerTeamMemberView
} from "../../../../packages/shared/contracts/broker-self-service.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { roleHasPermission, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { PARTNER_OWNER_ROLES } from "../partners/partner-admin.service";
import { partnerConflict, partnerForbidden, partnerNotFound, partnerUnprocessable } from "../partners/partner-errors";
import type { AdminUserCreateResponse, PartnerUserProvisionInput } from "../users/admin-users.controller";
import type { UserAccount, UsersService } from "../users/users.module";

export interface BrokerTeamServiceDeps {
  audit: AuditLogWriter;
  users: Pick<UsersService, "list" | "require" | "suspend" | "update" | "updateRoles">;
  /** Spec 051 R11: the existing user creation and activation path (token + e-mail, MFA required). */
  provisionUser: (actor: ActorContext, input: PartnerUserProvisionInput) => Promise<AdminUserCreateResponse>;
  /** Spec 053 R6: drops the cached access snapshot so the change applies to the next request. */
  invalidateUserAccess: (userId: string) => void;
}

export const BrokerTeamAuditActions = {
  readRefused: "broker_team.read_refused",
  invited: "broker_team.member_invited",
  inviteRefused: "broker_team.invite_refused",
  deactivated: "broker_team.member_deactivated",
  reactivated: "broker_team.member_reactivated",
  roleChanged: "broker_team.role_changed",
  actionRefused: "broker_team.action_refused"
} as const;

/** Owners count for the "last owner" rule while they can still sign in or activate their account. */
const OWNER_HOLDING_STATUSES = new Set<UserAccount["status"]>(["active", "invited"]);

function isOwner(roles: readonly string[]): boolean {
  return roles.some((role) => (PARTNER_OWNER_ROLES as readonly string[]).includes(role));
}

/**
 * Spec 053 US3 (G-03): the broker's own team. Owners and managers (`broker_team:write`) invite a
 * manager, an agent or a read-only user through the existing activation path (MFA required at the
 * first sign-in), deactivate, reactivate and change the role of a member. Guards (FR-010): never on
 * oneself, never the owner role, never the last active owner, never a manager acting on an owner.
 * The partner is always the actor's; a user of another partner answers 404.
 */
export class BrokerTeamService {
  constructor(private readonly deps: BrokerTeamServiceDeps) {}

  private requireTeam(actor: ActorContext, permission: "broker_team:read" | "broker_team:write", action: string, targetId = "team"): string {
    const partnerTenantId = actor.partnerTenantId;
    if (partnerTenantId && actor.roles.some((role) => role.startsWith("broker_") && roleHasPermission(role, permission))) return partnerTenantId;
    this.refuse(actor, action, targetId, "rbac_denied", { permission });
    throw partnerForbidden();
  }

  private refuse(actor: ActorContext, action: string, targetId: string, refusal: string, context: Record<string, unknown> = {}): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: "User",
      targetId,
      scope: actor.partnerTenantId ? { partnerTenantId: actor.partnerTenantId } : {},
      result: "refused",
      reason: refusal,
      context
    });
  }

  async list(actor: ActorContext): Promise<BrokerTeamMemberView[]> {
    const partnerTenantId = this.requireTeam(actor, "broker_team:read", BrokerTeamAuditActions.readRefused);
    return (await this.members(partnerTenantId))
      .map((user) => this.view(user, actor))
      .sort((left, right) => Number(right.isOwner) - Number(left.isOwner) || left.displayName.localeCompare(right.displayName));
  }

  /** FR-009: manager, agent or read-only; the activation token never reaches the inviter. */
  async invite(actor: ActorContext, input: unknown): Promise<BrokerTeamInviteResult> {
    const partnerTenantId = this.requireTeam(actor, "broker_team:write", BrokerTeamAuditActions.inviteRefused);
    const parsed = brokerTeamInviteSchema.parse(input);
    const reason = parsed.reason || "team invitation by the broker";
    let created: AdminUserCreateResponse;
    try {
      created = await this.deps.provisionUser(actor, { email: parsed.email, displayName: parsed.displayName, role: parsed.role, partnerTenantId, reason });
    } catch (error) {
      if (error instanceof Error && /already exists/i.test(error.message)) {
        this.refuse(actor, BrokerTeamAuditActions.inviteRefused, "invite", "email_unavailable", { role: parsed.role });
        // Neutral: never tells which partner (if any) already uses the address.
        throw partnerConflict("This e-mail address cannot be invited");
      }
      throw error;
    }
    this.deps.audit.write({
      actor,
      action: BrokerTeamAuditActions.invited,
      targetType: "User",
      targetId: created.user.id,
      scope: { partnerTenantId },
      result: "success",
      reason,
      context: { role: parsed.role, emailStatus: created.emailStatus }
    });
    return { member: this.view(created.user, actor), emailStatus: created.emailStatus, expiresAt: new Date(created.expiresAt).toISOString() };
  }

  /** FR-010/FR-011: status `suspended`; the next request of that user answers 401. */
  async deactivate(actor: ActorContext, userId: string, input: unknown): Promise<BrokerTeamMemberView> {
    const partnerTenantId = this.requireTeam(actor, "broker_team:write", BrokerTeamAuditActions.actionRefused, userId);
    const { reason } = brokerTeamActionSchema.parse(input);
    const target = await this.requireMember(partnerTenantId, userId);
    this.assertNotSelf(actor, target, "deactivate");
    this.assertMayActOn(actor, target, "deactivate");
    if (target.status === "suspended") {
      this.refuse(actor, BrokerTeamAuditActions.actionRefused, target.id, "already_deactivated", { action: "deactivate" });
      throw partnerConflict("The member is already deactivated");
    }
    if (isOwner(target.roles)) {
      const otherOwners = (await this.members(partnerTenantId)).filter((user) => user.id !== target.id && isOwner(user.roles) && OWNER_HOLDING_STATUSES.has(user.status));
      if (otherOwners.length === 0) {
        this.refuse(actor, BrokerTeamAuditActions.actionRefused, target.id, "last_owner", { action: "deactivate" });
        throw partnerUnprocessable(ErrorCodes.TEAM_LAST_OWNER, "The last active owner of the partner cannot be deactivated");
      }
    }
    const updated = await this.deps.users.suspend(target.id);
    this.deps.invalidateUserAccess(target.id);
    this.audited(actor, BrokerTeamAuditActions.deactivated, target, reason, { before: { status: target.status }, after: { status: updated.status } });
    return this.view(updated, actor);
  }

  /** Back to `active`, or `invited` for an account that was never activated (no password yet). */
  async reactivate(actor: ActorContext, userId: string, input: unknown): Promise<BrokerTeamMemberView> {
    const partnerTenantId = this.requireTeam(actor, "broker_team:write", BrokerTeamAuditActions.actionRefused, userId);
    const { reason } = brokerTeamActionSchema.parse(input);
    const target = await this.requireMember(partnerTenantId, userId);
    this.assertNotSelf(actor, target, "reactivate");
    this.assertMayActOn(actor, target, "reactivate");
    if (target.status !== "suspended") {
      this.refuse(actor, BrokerTeamAuditActions.actionRefused, target.id, "not_deactivated", { action: "reactivate", status: target.status });
      throw partnerConflict("Only a deactivated member can be reactivated");
    }
    const updated = await this.deps.users.update({ ...target, status: target.passwordHash ? "active" : "invited" });
    this.deps.invalidateUserAccess(target.id);
    this.audited(actor, BrokerTeamAuditActions.reactivated, target, reason, { before: { status: target.status }, after: { status: updated.status } });
    return this.view(updated, actor);
  }

  /** FR-010: a non-owner member only, never oneself; the owner role stays an admin decision. */
  async changeRole(actor: ActorContext, userId: string, input: unknown): Promise<BrokerTeamMemberView> {
    const partnerTenantId = this.requireTeam(actor, "broker_team:write", BrokerTeamAuditActions.actionRefused, userId);
    const { role, reason } = brokerTeamRoleChangeSchema.parse(input);
    const target = await this.requireMember(partnerTenantId, userId);
    this.assertNotSelf(actor, target, "change_role");
    if (isOwner(target.roles)) {
      this.refuse(actor, BrokerTeamAuditActions.actionRefused, target.id, "owner_role_admin_only", { action: "change_role" });
      throw partnerForbidden("The role of an owner is changed by AssurMatch only");
    }
    if (target.roles.length === 1 && target.roles[0] === role) return this.view(target, actor);
    const updated = await this.deps.users.updateRoles(target.id, [role as AssurMatchRole], reason, actor);
    this.deps.invalidateUserAccess(target.id);
    this.audited(actor, BrokerTeamAuditActions.roleChanged, target, reason, { before: { roles: target.roles }, after: { roles: updated.roles } });
    return this.view(updated, actor);
  }

  private async members(partnerTenantId: string): Promise<UserAccount[]> {
    // `UsersService.list` already narrows a partner actor to its own tenant; the filter is kept explicit.
    return (await this.deps.users.list({ roles: ["broker_read_only"], partnerTenantId, mfaVerified: true }))
      .filter((user) => user.partnerTenantId === partnerTenantId && user.status !== "deleted");
  }

  private async requireMember(partnerTenantId: string, userId: string): Promise<UserAccount> {
    const user = await this.deps.users.require(userId).catch(() => undefined);
    // SC-003: a user of another partner answers exactly like a missing one.
    if (!user || user.partnerTenantId !== partnerTenantId || user.status === "deleted") throw partnerNotFound("Team member not found");
    return user;
  }

  private assertNotSelf(actor: ActorContext, target: UserAccount, action: string): void {
    if (actor.actorId !== target.id) return;
    this.refuse(actor, BrokerTeamAuditActions.actionRefused, target.id, "self_action", { action });
    throw partnerUnprocessable(ErrorCodes.TEAM_SELF_ACTION, "You cannot change your own access or role");
  }

  /** A manager never acts on an owner; an owner may act on another owner (last owner rule apart). */
  private assertMayActOn(actor: ActorContext, target: UserAccount, action: string): void {
    if (!isOwner(target.roles) || isOwner(actor.roles)) return;
    this.refuse(actor, BrokerTeamAuditActions.actionRefused, target.id, "owner_protected", { action });
    throw partnerForbidden("Only an owner can change the access of another owner");
  }

  private audited(actor: ActorContext, action: string, target: UserAccount, reason: string, context: Record<string, unknown>): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: "User",
      targetId: target.id,
      scope: target.partnerTenantId ? { partnerTenantId: target.partnerTenantId } : {},
      result: "success",
      reason,
      context
    });
  }

  private view(user: UserAccount, actor: ActorContext): BrokerTeamMemberView {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      roles: [...user.roles],
      status: user.status,
      mfaEnrolled: Boolean(user.mfaSecretEncrypted) || user.mfaStatus === "enrolled" || user.mfaStatus === "verified",
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
      isSelf: user.id === actor.actorId,
      isOwner: isOwner(user.roles),
      createdAt: new Date(user.createdAt).toISOString()
    };
  }
}
