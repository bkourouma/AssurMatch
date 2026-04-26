import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "./lead-assignment.service";

export interface BrokerCrmAccessConfig {
  brokerCrmEnabled?: boolean;
}

export class BrokerCrmAccessPolicy {
  constructor(private readonly audit: AuditLogWriter, private readonly config: BrokerCrmAccessConfig = { brokerCrmEnabled: false }) {}

  assertCrmAccess(actor: ActorContext): void {
    if (!this.config.brokerCrmEnabled) this.refuse(actor, "BrokerCrm", "crm", "broker_crm_disabled");
    if (!actor.partnerTenantId) this.refuse(actor, "BrokerCrm", "crm", "missing_broker_tenant");
    if (actor.mfaVerified !== true) this.refuse(actor, "BrokerCrm", "crm", "mfa_required");
    if (actor.partnerPlan !== "pro" && actor.partnerPlan !== "enterprise") this.refuse(actor, "BrokerCrm", "crm", "crm_plan_not_allowed");
    if (!this.hasAny(actor, ["broker_crm:read", "broker_crm:read_assigned", "broker_crm:*"])) {
      this.refuse(actor, "BrokerCrm", "crm", "missing_crm_read_permission");
    }
  }

  assertLeadRead(actor: ActorContext, assignment: LeadAssignmentRecord): void {
    this.assertCrmAccess(actor);
    this.assertTenant(actor, assignment);
    if (this.isAssignedOnly(actor) && assignment.assignedAdvisorId !== actor.actorId) {
      this.refuse(actor, "LeadAssignment", assignment.id, "assigned_scope_required");
    }
  }

  assertMutation(actor: ActorContext, assignment: LeadAssignmentRecord): void {
    this.assertLeadRead(actor, assignment);
    if (actor.roles.includes("broker_read_only")) this.refuse(actor, "LeadAssignment", assignment.id, "read_only_role");
    if (this.isAssignedOnly(actor) && !this.hasAny(actor, ["broker_crm:update_assigned", "broker_crm:*"])) {
      this.refuse(actor, "LeadAssignment", assignment.id, "missing_assigned_update_permission");
    }
    if (!this.isAssignedOnly(actor) && !this.hasAny(actor, ["broker_crm:update", "broker_crm:*"])) {
      this.refuse(actor, "LeadAssignment", assignment.id, "missing_crm_update_permission");
    }
  }

  assertAssignment(actor: ActorContext, assignment: LeadAssignmentRecord, advisorPartnerTenantId: string): void {
    this.assertMutation(actor, assignment);
    if (!this.hasAny(actor, ["broker_crm:assign", "broker_crm:*"])) {
      this.refuse(actor, "LeadAssignment", assignment.id, "missing_assign_permission");
    }
    if (advisorPartnerTenantId !== actor.partnerTenantId) {
      this.refuse(actor, "LeadAssignment", assignment.id, "advisor_cross_tenant");
    }
  }

  assertSameTenantAssignee(actor: ActorContext, assignment: LeadAssignmentRecord, assigneeId: string): void {
    const assigneeTenantId = actor.brokerUserTenantIds?.[assigneeId];
    if (assigneeTenantId !== assignment.partnerTenantId || assigneeTenantId !== actor.partnerTenantId) {
      this.refuse(actor, "BrokerCrmAssignee", assigneeId, "assignee_cross_tenant_or_unresolved");
    }
  }

  assertExport(actor: ActorContext): void {
    this.assertCrmAccess(actor);
    if (!this.hasAny(actor, ["broker_crm:export", "broker_crm:*"])) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerCrmExportRefused,
        targetType: "BrokerCrmExport",
        targetId: "export",
        scope: { partnerTenantId: actor.partnerTenantId },
        result: "refused",
        reason: "missing_export_permission",
        context: {}
      });
      throw new Error("CRM export denied");
    }
  }

  canSeeSensitiveSearch(actor: ActorContext): boolean {
    return this.hasAny(actor, ["broker_crm:read", "broker_crm:*"]) && !this.isAssignedOnly(actor);
  }

  private assertTenant(actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (actor.partnerTenantId !== assignment.partnerTenantId) {
      this.refuse(actor, "LeadAssignment", assignment.id, "cross_tenant_access");
    }
  }

  private isAssignedOnly(actor: ActorContext): boolean {
    return actor.roles.includes("broker_agent") && !this.hasAny(actor, ["broker_crm:read", "broker_crm:*"]);
  }

  private hasAny(actor: ActorContext, permissions: string[]): boolean {
    return actor.roles.some((role) => permissions.some((permission) => roleHasPermission(role, permission)));
  }

  private refuse(actor: ActorContext, targetType: string, targetId: string, reason: string): never {
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmAccessRefused,
      targetType,
      targetId,
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "refused",
      reason,
      context: {}
    });
    throw new Error("Broker CRM access denied");
  }
}
