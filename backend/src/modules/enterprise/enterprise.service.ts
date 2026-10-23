import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type {
  AdminPartnerSlaRow,
  BrokerBranding,
  BrokerCustomPermission,
  PartnerAgency,
  PartnerCustomRole,
  PartnerCustomRoleAssignment,
  PartnerSla
} from "../../../../packages/shared/contracts/enterprise.contracts";
import {
  AGENCY_FILTER_NONE,
  brokerBrandingUpdateSchema,
  brokerCustomPermissions,
  partnerAgencyCreateSchema,
  partnerAgencyMemberSchema,
  partnerAgencyUpdateSchema,
  partnerCustomRoleAssignSchema,
  partnerCustomRoleCreateSchema,
  partnerCustomRoleUpdateSchema,
  partnerSlaUpdateSchema
} from "../../../../packages/shared/contracts/enterprise.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { AdvisorAgencyPredicate } from "../common/agency-scope";
import { actorHasPermission } from "../common/rbac/actor-permissions";
import type { ActorContext } from "../common/types";
import { summarizeFirstVisibleReply } from "../leads/first-visible-reply";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnersService } from "../partners/partners.module";
import type { UsersService } from "../users/users.module";
import { CustomRoleAccessCache, type ResolvedCustomRole } from "./custom-role-access-cache";
import { EnterpriseAuditActions } from "./enterprise-audit-actions";
import {
  MemoryEnterpriseRepository,
  type EnterpriseRepository,
  type PartnerAgencyRecord,
  type PartnerBrandingRecord,
  type PartnerCustomRoleRecord
} from "./enterprise.repository";

export interface EnterpriseDeps {
  audit: AuditLogWriter;
  partners: PartnersService;
  assignments: LeadAssignmentService;
  /** Spec 064: resolves the member a custom role is assigned to (same tenant only). */
  users: Pick<UsersService, "require">;
  repository?: EnterpriseRepository | undefined;
  /** Spec 064: test hooks for the resolver cache. */
  customRoleCache?: { ttlMs?: number; now?: () => number } | undefined;
}

export class EnterpriseAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Enterprise access denied: ${reason}`);
    this.name = "EnterpriseAccessRefusedError";
  }
}

const DEFAULT_SLA_MINUTES = 240;

/** Spec 051 R9: the broker's own target, never looser than the contractual one. */
function effectiveSlaTarget(brokerTarget: number | undefined, contractual: number | undefined): number {
  if (contractual === undefined) return brokerTarget ?? DEFAULT_SLA_MINUTES;
  return brokerTarget === undefined ? contractual : Math.min(brokerTarget, contractual);
}
const SLA_WINDOW_DAYS = 30;
const PLATFORM_MENTION = "Plateforme technique AssurMatch" as const;
const ALLOWED_PERMISSIONS = new Set<string>(brokerCustomPermissions);
/** Spec 064 (D5): the owner role is an AssurMatch decision; an owner never carries a custom role. */
const OWNER_ROLES: readonly string[] = ["broker_owner_starter", "broker_owner_pro"];

/**
 * Enterprise capabilities for a partner tenant: agencies, custom roles, SLA target and broker-portal
 * branding. Everything is tenant-bound and Enterprise-gated; none of it changes eligibility,
 * routing or what a visitor sees on the public comparator.
 */
export class EnterpriseService {
  private readonly repository: EnterpriseRepository;
  /**
   * Spec 064: read by the auth guard on every broker request. Fail-closed contract: a lookup error
   * is rethrown (never turned into "no restriction"), the guard then answers 401.
   */
  readonly customRoleAccess: CustomRoleAccessCache;

  constructor(private readonly deps: EnterpriseDeps) {
    this.repository = deps.repository ?? new MemoryEnterpriseRepository();
    this.customRoleAccess = new CustomRoleAccessCache(
      (actor) => this.customRoleFor(actor),
      deps.customRoleCache?.ttlMs,
      deps.customRoleCache?.now
    );
  }

  async listAgencies(actor: ActorContext): Promise<PartnerAgency[]> {
    const tenantId = this.assertEnterprise(actor, "read");
    return (await this.repository.listAgencies(tenantId)).map((record) => this.toAgency(record));
  }

  async createAgency(input: unknown, actor: ActorContext): Promise<PartnerAgency> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = partnerAgencyCreateSchema.parse(input ?? {});
    const now = new Date();
    const record: PartnerAgencyRecord = {
      id: crypto.randomUUID(),
      partnerTenantId: tenantId,
      name: parsed.name,
      countryCode: parsed.countryCode,
      city: parsed.city ?? null,
      status: "active",
      memberIds: [],
      reason: parsed.reason,
      createdById: actor.actorId ?? null,
      createdAt: now,
      updatedAt: now
    };
    const saved = await this.repository.upsertAgency(record);
    this.audit(actor, EnterpriseAuditActions.agencyCreated, "PartnerAgency", saved.id, tenantId, parsed.reason, { name: saved.name, countryCode: saved.countryCode });
    return this.toAgency(saved);
  }

  async updateAgency(id: string, input: unknown, actor: ActorContext): Promise<PartnerAgency> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = partnerAgencyUpdateSchema.parse(input ?? {});
    const existing = await this.requireAgency(id, tenantId);
    const updated: PartnerAgencyRecord = {
      ...existing,
      name: parsed.name ?? existing.name,
      city: parsed.city ?? existing.city,
      status: parsed.status ?? existing.status,
      reason: parsed.reason,
      updatedAt: new Date()
    };
    const saved = await this.repository.upsertAgency(updated);
    this.audit(actor, EnterpriseAuditActions.agencyUpdated, "PartnerAgency", saved.id, tenantId, parsed.reason, {
      previous: { name: existing.name, city: existing.city, status: existing.status },
      next: { name: saved.name, city: saved.city, status: saved.status }
    });
    return this.toAgency(saved);
  }

  async assignMember(id: string, input: unknown, actor: ActorContext): Promise<PartnerAgency> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = partnerAgencyMemberSchema.parse(input ?? {});
    const existing = await this.requireAgency(id, tenantId);
    // A member must already belong to this tenant: agencies never create cross-tenant access.
    const memberTenantId = actor.brokerUserTenantIds?.[parsed.memberId];
    if (memberTenantId && memberTenantId !== tenantId) this.refuse(actor, "member_cross_tenant");
    const memberIds = existing.memberIds.includes(parsed.memberId) ? existing.memberIds : [...existing.memberIds, parsed.memberId];
    const saved = await this.repository.upsertAgency({ ...existing, memberIds, reason: parsed.reason, updatedAt: new Date() });
    this.audit(actor, EnterpriseAuditActions.agencyMemberAssigned, "PartnerAgency", saved.id, tenantId, parsed.reason, { memberCount: saved.memberIds.length });
    return this.toAgency(saved);
  }

  /**
   * Spec 064 (agency display filter). A lead belongs to an agency through the agency membership of
   * its assigned advisor; a lead with no advisor, or an advisor in no agency, is "Sans agence"
   * (`none`). An advisor in several agencies shows under each. This is a display filter applied by
   * the lead and dashboard services AFTER their access policies, so it only narrows what the actor
   * already sees (exposed to them as an `AgencyScopePort`). Undefined (no filtering) when no agency is requested or when the tenant is not
   * Enterprise: the parameter is then ignored. An agency that does not exist in the actor's tenant
   * (unknown or another tenant's) answers the same audited 404.
   */
  async agencyScopeFor(actor: ActorContext, agencyId: string | undefined): Promise<AdvisorAgencyPredicate | undefined> {
    if (!agencyId || actor.partnerPlan !== "enterprise" || !actor.partnerTenantId) return undefined;
    const agencies = await this.repository.listAgencies(actor.partnerTenantId);
    if (agencyId === AGENCY_FILTER_NONE) {
      const inAnAgency = new Set(agencies.flatMap((agency) => agency.memberIds));
      return (advisorId) => !advisorId || !inAnAgency.has(advisorId);
    }
    const agency = agencies.find((entry) => entry.id === agencyId);
    if (!agency) this.refuseNotFound(actor, "agency_not_found", agencyId, "Agency not found");
    const members = new Set(agency.memberIds);
    return (advisorId) => Boolean(advisorId) && members.has(advisorId as string);
  }

  async listCustomRoles(actor: ActorContext): Promise<PartnerCustomRole[]> {
    const tenantId = this.assertEnterprise(actor, "read");
    return (await this.repository.listCustomRoles(tenantId)).map((record) => this.toRole(record, []));
  }

  async createCustomRole(input: unknown, actor: ActorContext): Promise<PartnerCustomRole> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = partnerCustomRoleCreateSchema.parse(input ?? {});
    const { allowed, rejected } = this.filterPermissions(parsed.permissions);
    if (allowed.length === 0) throw new Error("Invalid custom role: no allowed broker permission requested");
    const now = new Date();
    const saved = await this.repository.upsertCustomRole({
      id: crypto.randomUUID(),
      partnerTenantId: tenantId,
      name: parsed.name,
      permissions: allowed,
      memberIds: [],
      reason: parsed.reason,
      createdById: actor.actorId ?? null,
      createdAt: now,
      updatedAt: now
    });
    this.audit(actor, EnterpriseAuditActions.customRoleCreated, "PartnerCustomRole", saved.id, tenantId, parsed.reason, { permissions: saved.permissions, rejectedPermissions: rejected });
    return this.toRole(saved, rejected);
  }

  async updateCustomRole(id: string, input: unknown, actor: ActorContext): Promise<PartnerCustomRole> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = partnerCustomRoleUpdateSchema.parse(input ?? {});
    const existing = await this.repository.findCustomRole(id);
    if (!existing || existing.partnerTenantId !== tenantId) throw new Error("Custom role not found");
    const { allowed, rejected } = this.filterPermissions(parsed.permissions);
    if (allowed.length === 0) throw new Error("Invalid custom role: no allowed broker permission requested");
    // Spec 064: only the permission columns are written, so a concurrent assignment is never overwritten by a stale member list.
    const saved = await this.repository.updateCustomRolePermissions(id, { permissions: allowed, reason: parsed.reason, updatedAt: new Date() });
    if (!saved) throw new Error("Custom role not found");
    // Spec 064: the members of this role are restricted by the new list from their next request.
    this.customRoleAccess.invalidate();
    this.audit(actor, EnterpriseAuditActions.customRoleUpdated, "PartnerCustomRole", saved.id, tenantId, parsed.reason, {
      previous: existing.permissions,
      next: saved.permissions,
      rejectedPermissions: rejected
    });
    return this.toRole(saved, rejected);
  }

  /**
   * Spec 064 (FR-006): assigns (or clears, with a null role) the custom role of a member of the
   * actor's own tenant. Allowed to the owner and to managers (`broker_team:write`), unlike the
   * creation of roles which stays with the owner. A member holds at most one custom role. Never on
   * oneself, never on an owner, never across tenants (a user of another tenant answers 404 like a
   * missing one). Only an owner may target a manager (D2): a manager acts on agents and read-only
   * users. Every refusal is audited; success is audited as assigned / unassigned.
   *
   * Membership is a read-modify-write on a JSON array of the role (no lock): two simultaneous
   * assignments on the same role could drop one of them. That is acceptable for the volume of an
   * Enterprise administration (a handful of changes a day by a few people). A move adds the member
   * to the new role BEFORE removing it from the old one, so an interruption in between never leaves
   * a member unrestricted (the resolver then intersects the roles, see `customRoleFor`).
   */
  async assignCustomRole(userId: string, input: unknown, actor: ActorContext): Promise<PartnerCustomRoleAssignment> {
    const tenantId = this.assertBroker(actor);
    if (actor.partnerPlan !== "enterprise") this.refuse(actor, "plan_enterprise_required");
    if (!actorHasPermission(actor, "broker_team:write")) this.refuse(actor, "team_write_permission_required");
    const parsed = partnerCustomRoleAssignSchema.parse(input ?? {});
    const target = await this.deps.users.require(userId).catch(() => undefined);
    // A user of another tenant, a non broker user and a deleted one answer exactly like a missing one.
    if (!target || target.partnerTenantId !== tenantId || target.status === "deleted" || !target.roles.some((role) => role.startsWith("broker_"))) {
      this.refuseNotFound(actor, "member_not_found", userId, "Team member not found");
    }
    if (actor.actorId === target.id) this.refuse(actor, "self_assignment");
    if (target.roles.some((role) => OWNER_ROLES.includes(role))) this.refuse(actor, "owner_protected");
    if (target.roles.includes("broker_manager") && !actor.roles.some((role) => OWNER_ROLES.includes(role))) this.refuse(actor, "owner_required_for_manager_target");
    const roles = await this.repository.listCustomRoles(tenantId);
    const next = parsed.customRoleId === null ? undefined : roles.find((role) => role.id === parsed.customRoleId);
    if (parsed.customRoleId !== null && !next) this.refuseNotFound(actor, "custom_role_not_found", parsed.customRoleId, "Custom role not found");
    const previous = roles.find((role) => role.memberIds.includes(target.id));
    const now = new Date();
    // Add first, then remove: a failure in between leaves the member restricted by both roles, never by none.
    if (next && !next.memberIds.includes(target.id)) await this.repository.updateCustomRoleMembers(next.id, [...next.memberIds, target.id], now);
    for (const role of roles) {
      if (role.id === next?.id || !role.memberIds.includes(target.id)) continue;
      await this.repository.updateCustomRoleMembers(role.id, role.memberIds.filter((memberId) => memberId !== target.id), now);
    }
    this.customRoleAccess.invalidate(target.id);
    this.audit(
      actor,
      next ? EnterpriseAuditActions.customRoleAssigned : EnterpriseAuditActions.customRoleUnassigned,
      "User",
      target.id,
      tenantId,
      parsed.reason,
      {
        before: previous ? { id: previous.id, name: previous.name } : null,
        after: next ? { id: next.id, name: next.name } : null
      }
    );
    return { userId: target.id, customRole: next ? { id: next.id, name: next.name } : null };
  }

  /**
   * Spec 064 (FR-007): the custom role that restricts this actor, if any, with its effective
   * permissions. Only a broker member of a tenant can carry one; an owner never does (a leftover row
   * is ignored). Called through `customRoleAccess` (cached) by the auth guard on every request.
   */
  async customRoleFor(actor: ActorContext): Promise<ResolvedCustomRole | undefined> {
    if (!actor.actorId || !actor.partnerTenantId) return undefined;
    if (!actor.roles.some((role) => role.startsWith("broker_")) || actor.roles.some((role) => OWNER_ROLES.includes(role))) return undefined;
    const held = (await this.repository.listCustomRoles(actor.partnerTenantId)).filter((entry) => entry.memberIds.includes(actor.actorId as string));
    const [first] = held;
    if (!first) return undefined;
    // A member is meant to hold one role. If a corrupted or half-finished state lists it in several,
    // the most restrictive answer applies: the intersection of their effective permissions.
    const permissions = held
      .map((role) => this.effectivePermissions(actor, role))
      .reduce((common, list) => common.filter((permission) => list.includes(permission)));
    return { id: first.id, name: first.name, permissions };
  }

  /**
   * Effective permissions of a member: the custom grant can only narrow or restate what the base
   * role already allows, never extend it. This keeps a tenant from minting admin capabilities.
   */
  effectivePermissions(actor: ActorContext, customRole: Pick<PartnerCustomRole, "permissions"> | undefined): string[] {
    const fromRoles = new Set<string>();
    for (const permission of ALLOWED_PERMISSIONS) {
      if (actor.roles.some((role) => roleHasPermission(role, permission))) fromRoles.add(permission);
    }
    if (!customRole) return [...fromRoles].sort();
    return customRole.permissions.filter((permission) => fromRoles.has(permission)).sort();
  }

  async sla(actor: ActorContext): Promise<PartnerSla> {
    const tenantId = this.assertBroker(actor);
    const branding = await this.repository.findBranding(tenantId);
    const target = effectiveSlaTarget(branding?.firstActionTargetMinutes, await this.contractualTarget(tenantId));
    const metrics = await this.slaMetrics(tenantId, target);
    this.audit(actor, EnterpriseAuditActions.slaRead, "PartnerSla", tenantId, tenantId, undefined, { complianceRate: metrics.complianceRate });
    return {
      partnerTenantId: tenantId,
      firstActionTargetMinutes: target,
      windowDays: SLA_WINDOW_DAYS,
      ...metrics,
      updatedAt: branding ? branding.updatedAt.toISOString() : null
    };
  }

  async updateSla(input: unknown, actor: ActorContext): Promise<PartnerSla> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = partnerSlaUpdateSchema.parse(input ?? {});
    // Spec 051 R9: the broker may tighten its target, never loosen it past the contractual target.
    const contractual = await this.contractualTarget(tenantId);
    if (contractual !== undefined && parsed.firstActionTargetMinutes > contractual) {
      this.deps.audit.write({
        actor,
        action: EnterpriseAuditActions.slaChanged,
        targetType: "PartnerSla",
        targetId: tenantId,
        scope: { partnerTenantId: tenantId },
        result: "refused",
        reason: "sla_target_exceeds_contract",
        context: { requested: parsed.firstActionTargetMinutes, contractual, requestReason: parsed.reason }
      });
      throw new UnprocessableEntityException({
        code: ErrorCodes.SLA_TARGET_EXCEEDS_CONTRACT,
        message: `The target cannot exceed the contractual target of ${contractual} minutes`
      });
    }
    const existing = await this.repository.findBranding(tenantId);
    const saved = await this.saveBranding(tenantId, {
      displayLabel: existing?.displayLabel ?? "Espace courtier",
      primaryColor: existing?.primaryColor ?? "#1f2937",
      firstActionTargetMinutes: parsed.firstActionTargetMinutes,
      reason: parsed.reason
    }, existing, actor);
    this.audit(actor, EnterpriseAuditActions.slaChanged, "PartnerSla", tenantId, tenantId, parsed.reason, {
      previous: existing?.firstActionTargetMinutes ?? DEFAULT_SLA_MINUTES,
      next: saved.firstActionTargetMinutes
    });
    return this.sla(actor);
  }

  async branding(actor: ActorContext): Promise<BrokerBranding> {
    const tenantId = this.assertBroker(actor);
    const record = await this.repository.findBranding(tenantId);
    return {
      partnerTenantId: tenantId,
      displayLabel: record?.displayLabel ?? "Espace courtier",
      primaryColor: record?.primaryColor ?? "#1f2937",
      platformMention: PLATFORM_MENTION,
      updatedAt: record ? record.updatedAt.toISOString() : null
    };
  }

  async updateBranding(input: unknown, actor: ActorContext): Promise<BrokerBranding> {
    const tenantId = this.assertEnterprise(actor, "write");
    const parsed = brokerBrandingUpdateSchema.parse(input ?? {});
    const existing = await this.repository.findBranding(tenantId);
    const saved = await this.saveBranding(tenantId, {
      displayLabel: parsed.displayLabel,
      primaryColor: parsed.primaryColor,
      firstActionTargetMinutes: existing?.firstActionTargetMinutes ?? DEFAULT_SLA_MINUTES,
      reason: parsed.reason
    }, existing, actor);
    this.audit(actor, EnterpriseAuditActions.brandingChanged, "PartnerBranding", saved.id, tenantId, parsed.reason, {
      previous: { displayLabel: existing?.displayLabel ?? null, primaryColor: existing?.primaryColor ?? null },
      next: { displayLabel: saved.displayLabel, primaryColor: saved.primaryColor },
      appliesTo: "broker_back_office_only"
    });
    return this.branding(actor);
  }

  /** Admin read of SLA compliance per partner; no tenant data beyond aggregates. */
  async adminSlaOverview(actor: ActorContext): Promise<AdminPartnerSlaRow[]> {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, "partners:read"))) this.refuse(actor, "forbidden_role");
    const [allPartners, branding] = await Promise.all([this.deps.partners.list(), this.repository.listBranding()]);
    // Spec 051 R13: the Admin Pays now reads partners; a country-scoped admin only sees its countries.
    const scoped = !actor.roles.includes("super_admin") && Boolean(actor.countryScopes?.length);
    const partners = scoped ? allPartners.filter((partner) => Boolean(partner.countryId) && actor.countryScopes!.includes(partner.countryId as string)) : allPartners;
    const targets = new Map(branding.map((entry) => [entry.partnerTenantId, entry.firstActionTargetMinutes]));
    const rows: AdminPartnerSlaRow[] = [];
    for (const partner of partners) {
      // Spec 051 R9: the contractual target set by the admin prevails when it exists.
      const target = partner.slaTargetMinutes ?? targets.get(partner.id) ?? DEFAULT_SLA_MINUTES;
      const metrics = await this.slaMetrics(partner.id, target);
      rows.push({
        partnerTenantId: partner.id,
        partnerName: partner.legalName,
        plan: partner.plan as AdminPartnerSlaRow["plan"],
        firstActionTargetMinutes: target,
        ...metrics
      });
    }
    this.audit(actor, EnterpriseAuditActions.slaRead, "PartnerSla", "admin-overview", null, undefined, { partners: rows.length });
    return rows;
  }

  private async contractualTarget(partnerTenantId: string): Promise<number | undefined> {
    const partner = await this.deps.partners.require(partnerTenantId).catch(() => undefined);
    return partner?.slaTargetMinutes ?? undefined;
  }

  private async slaMetrics(partnerTenantId: string, targetMinutes: number) {
    const since = Date.now() - SLA_WINDOW_DAYS * 24 * 3600 * 1000;
    const assignments = (await this.deps.assignments.list()).filter((assignment) => assignment.partnerTenantId === partnerTenantId && assignment.assignedAt.getTime() >= since);
    const delays = assignments.map((assignment) => this.firstActionMinutes(assignment)).filter((minutes): minutes is number => minutes !== null);
    const withinTarget = delays.filter((minutes) => minutes <= targetMinutes).length;
    return {
      leadsMeasured: delays.length,
      leadsWithinTarget: withinTarget,
      complianceRate: delays.length === 0 ? 0 : withinTarget / delays.length,
      averageFirstActionMinutes: delays.length === 0 ? null : Math.round(delays.reduce((sum, minutes) => sum + minutes, 0) / delays.length),
      // Spec 062 E-08: the same window, measured to the first reply the visitor can see.
      ...summarizeFirstVisibleReply(assignments, targetMinutes)
    };
  }

  private firstActionMinutes(assignment: LeadAssignmentRecord): number | null {
    const firstAction = assignment.seenAt ?? assignment.acceptedAt ?? assignment.lastBrokerActionAt ?? assignment.crmUpdatedAt;
    if (!firstAction) return null;
    return Math.max(0, Math.round((firstAction.getTime() - assignment.assignedAt.getTime()) / 60_000));
  }

  private async saveBranding(
    partnerTenantId: string,
    values: { displayLabel: string; primaryColor: string; firstActionTargetMinutes: number; reason: string },
    existing: PartnerBrandingRecord | undefined,
    actor: ActorContext
  ): Promise<PartnerBrandingRecord> {
    const now = new Date();
    return this.repository.upsertBranding({
      id: existing?.id ?? crypto.randomUUID(),
      partnerTenantId,
      displayLabel: values.displayLabel,
      primaryColor: values.primaryColor,
      firstActionTargetMinutes: values.firstActionTargetMinutes,
      reason: values.reason,
      updatedById: actor.actorId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  }

  private filterPermissions(requested: string[]): { allowed: BrokerCustomPermission[]; rejected: string[] } {
    const allowed: BrokerCustomPermission[] = [];
    const rejected: string[] = [];
    for (const permission of requested) {
      if (ALLOWED_PERMISSIONS.has(permission)) allowed.push(permission as BrokerCustomPermission);
      else rejected.push(permission);
    }
    return { allowed: [...new Set(allowed)], rejected };
  }

  private async requireAgency(id: string, tenantId: string): Promise<PartnerAgencyRecord> {
    const agency = await this.repository.findAgency(id);
    if (!agency || agency.partnerTenantId !== tenantId) throw new Error("Agency not found");
    return agency;
  }

  private toAgency(record: PartnerAgencyRecord): PartnerAgency {
    return {
      id: record.id,
      partnerTenantId: record.partnerTenantId,
      name: record.name,
      countryCode: record.countryCode,
      city: record.city,
      status: record.status,
      memberCount: record.memberIds.length,
      memberIds: [...record.memberIds],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private toRole(record: PartnerCustomRoleRecord, rejected: string[]): PartnerCustomRole {
    return {
      id: record.id,
      partnerTenantId: record.partnerTenantId,
      name: record.name,
      permissions: record.permissions,
      rejectedPermissions: rejected,
      memberIds: [...record.memberIds],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private assertBroker(actor: ActorContext): string {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    if (!actor.roles.some((role) => role.startsWith("broker_"))) this.refuse(actor, "forbidden_role");
    if (!actor.partnerTenantId) this.refuse(actor, "missing_broker_tenant");
    return actor.partnerTenantId;
  }

  private assertEnterprise(actor: ActorContext, mode: "read" | "write"): string {
    const tenantId = this.assertBroker(actor);
    if (actor.partnerPlan !== "enterprise") this.refuse(actor, "plan_enterprise_required");
    if (mode === "write" && !actor.roles.some((role) => roleHasPermission(role, "broker_crm:*"))) this.refuse(actor, "owner_permission_required");
    return tenantId;
  }

  private audit(actor: ActorContext, action: string, targetType: string, targetId: string, partnerTenantId: string | null, reason: string | undefined, context: Record<string, unknown>): void {
    this.deps.audit.write({
      actor,
      action,
      targetType,
      targetId,
      scope: { partnerTenantId },
      result: "success",
      ...(reason ? { reason } : {}),
      context
    });
  }

  /** Audited refusal answered 404, so that the existence of a user or role of another tenant is not revealed. */
  private refuseNotFound(actor: ActorContext, reason: string, targetId: string, message: string): never {
    this.deps.audit.write({
      actor,
      action: EnterpriseAuditActions.accessRefused,
      targetType: "Enterprise",
      targetId,
      scope: { partnerTenantId: actor.partnerTenantId ?? null, roles: actor.roles, plan: actor.partnerPlan ?? null },
      result: "refused",
      reason,
      context: {}
    });
    throw new NotFoundException({ code: ErrorCodes.NOT_FOUND, message });
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: EnterpriseAuditActions.accessRefused,
      targetType: "Enterprise",
      targetId: actor.partnerTenantId ?? "unknown",
      scope: { partnerTenantId: actor.partnerTenantId ?? null, roles: actor.roles, plan: actor.partnerPlan ?? null },
      result: "refused",
      reason,
      context: {}
    });
    throw new EnterpriseAccessRefusedError(reason);
  }
}
