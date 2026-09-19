import type {
  AdminPartnerSlaRow,
  BrokerBranding,
  BrokerCustomPermission,
  PartnerAgency,
  PartnerCustomRole,
  PartnerSla
} from "../../../../packages/shared/contracts/enterprise.contracts";
import {
  brokerBrandingUpdateSchema,
  brokerCustomPermissions,
  partnerAgencyCreateSchema,
  partnerAgencyMemberSchema,
  partnerAgencyUpdateSchema,
  partnerCustomRoleCreateSchema,
  partnerCustomRoleUpdateSchema,
  partnerSlaUpdateSchema
} from "../../../../packages/shared/contracts/enterprise.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnersService } from "../partners/partners.module";
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
  repository?: EnterpriseRepository | undefined;
}

export class EnterpriseAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Enterprise access denied: ${reason}`);
    this.name = "EnterpriseAccessRefusedError";
  }
}

const DEFAULT_SLA_MINUTES = 240;
const SLA_WINDOW_DAYS = 30;
const PLATFORM_MENTION = "Plateforme technique AssurMatch" as const;
const ALLOWED_PERMISSIONS = new Set<string>(brokerCustomPermissions);

/**
 * Enterprise capabilities for a partner tenant: agencies, custom roles, SLA target and broker-portal
 * branding. Everything is tenant-bound and Enterprise-gated; none of it changes eligibility,
 * routing or what a visitor sees on the public comparator.
 */
export class EnterpriseService {
  private readonly repository: EnterpriseRepository;

  constructor(private readonly deps: EnterpriseDeps) {
    this.repository = deps.repository ?? new MemoryEnterpriseRepository();
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
    const saved = await this.repository.upsertCustomRole({ ...existing, permissions: allowed, reason: parsed.reason, updatedAt: new Date() });
    this.audit(actor, EnterpriseAuditActions.customRoleUpdated, "PartnerCustomRole", saved.id, tenantId, parsed.reason, {
      previous: existing.permissions,
      next: saved.permissions,
      rejectedPermissions: rejected
    });
    return this.toRole(saved, rejected);
  }

  /**
   * Effective permissions of a member: the custom grant can only narrow or restate what the base
   * role already allows, never extend it. This keeps a tenant from minting admin capabilities.
   */
  effectivePermissions(actor: ActorContext, customRole: PartnerCustomRole | undefined): string[] {
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
    const target = branding?.firstActionTargetMinutes ?? DEFAULT_SLA_MINUTES;
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
    const [partners, branding] = await Promise.all([this.deps.partners.list(), this.repository.listBranding()]);
    const targets = new Map(branding.map((entry) => [entry.partnerTenantId, entry.firstActionTargetMinutes]));
    const rows: AdminPartnerSlaRow[] = [];
    for (const partner of partners) {
      const target = targets.get(partner.id) ?? DEFAULT_SLA_MINUTES;
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

  private async slaMetrics(partnerTenantId: string, targetMinutes: number) {
    const since = Date.now() - SLA_WINDOW_DAYS * 24 * 3600 * 1000;
    const assignments = (await this.deps.assignments.list()).filter((assignment) => assignment.partnerTenantId === partnerTenantId && assignment.assignedAt.getTime() >= since);
    const delays = assignments.map((assignment) => this.firstActionMinutes(assignment)).filter((minutes): minutes is number => minutes !== null);
    const withinTarget = delays.filter((minutes) => minutes <= targetMinutes).length;
    return {
      leadsMeasured: delays.length,
      leadsWithinTarget: withinTarget,
      complianceRate: delays.length === 0 ? 0 : withinTarget / delays.length,
      averageFirstActionMinutes: delays.length === 0 ? null : Math.round(delays.reduce((sum, minutes) => sum + minutes, 0) / delays.length)
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
