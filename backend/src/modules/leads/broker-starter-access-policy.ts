import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "./lead-assignment.service";

export interface BrokerStarterAccessConfig {
  starterPortalEnabled?: boolean;
  brokerDashboardEnabled?: boolean;
  brokerCrmEnabled?: boolean;
}

const STARTER_ALLOWED = [
  "lead_list",
  "lead_detail",
  "accept",
  "reject",
  "dispute",
  "history",
  "dashboard",
  "notifications",
  "csv_export_if_permitted"
] as const;

const STARTER_BLOCKED = [
  "crm_kanban",
  "advanced_pipeline",
  "tasks",
  "reminders",
  "team_assignment",
  "advanced_sales_notes",
  "quote_attachments",
  "advanced_dashboard",
  "advanced_commercial_ai",
  "billing",
  "partner_api",
  "webhooks",
  "payments",
  "subscription",
  "policy_issuance",
  "attestations",
  "claims"
] as const;

export class BrokerStarterAccessPolicy {
  constructor(private readonly audit: AuditLogWriter, private readonly config: BrokerStarterAccessConfig = { starterPortalEnabled: true, brokerDashboardEnabled: true, brokerCrmEnabled: false }) {}

  assertPortalAccess(actor: ActorContext): void {
    if (!this.config.starterPortalEnabled) {
      this.refuse(actor, "BrokerStarterPortal", "portal", "starter_portal_disabled");
    }
    if (!actor.partnerTenantId) {
      this.refuse(actor, "BrokerStarterPortal", "portal", "missing_broker_tenant");
    }
    if (actor.mfaVerified !== true) {
      this.refuse(actor, "BrokerStarterPortal", "portal", "mfa_required");
    }
    if (!this.hasPermission(actor, "broker_leads:read")) {
      this.refuse(actor, "BrokerStarterPortal", "portal", "missing_broker_read_permission");
    }
  }

  assertDashboardAccess(actor: ActorContext): void {
    this.assertPortalAccess(actor);
    if (!this.config.brokerDashboardEnabled) {
      this.refuse(actor, "BrokerStarterDashboard", "dashboard", "broker_dashboard_disabled");
    }
  }

  assertLeadAccess(actor: ActorContext, assignment: LeadAssignmentRecord): void {
    this.assertPortalAccess(actor);
    if (actor.partnerTenantId !== assignment.partnerTenantId) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerStarterCrossTenantRefused,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { requestedPartnerTenantId: actor.partnerTenantId, ownerPartnerTenantId: assignment.partnerTenantId },
        result: "refused",
        reason: "cross_tenant_access",
        context: {}
      });
      throw new Error("Lead access denied");
    }
  }

  assertMutationAccess(actor: ActorContext, assignment: LeadAssignmentRecord): void {
    this.assertLeadAccess(actor, assignment);
    if (!this.hasPermission(actor, "broker_leads:update")) {
      this.refuse(actor, "LeadAssignment", assignment.id, "missing_broker_update_permission");
    }
  }

  assertExportAccess(actor: ActorContext): void {
    this.assertPortalAccess(actor);
    if (!this.hasPermission(actor, "broker_leads:export")) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerStarterExportRefused,
        targetType: "LeadAssignment",
        targetId: "export",
        scope: { partnerTenantId: actor.partnerTenantId },
        result: "refused",
        reason: "missing_export_permission",
        context: {}
      });
      throw new Error("Lead export denied");
    }
  }

  assertProCapabilityBlocked(actor: ActorContext, capability: string): void {
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterProFeatureBlocked,
      targetType: "BrokerCapability",
      targetId: capability,
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "refused",
      reason: "starter_plan_blocks_crm_feature",
      context: { brokerCrmEnabled: this.config.brokerCrmEnabled === true }
    });
    throw new Error("Le plan Starter ne comprend pas le CRM complet");
  }

  capabilities() {
    return {
      plan: "starter" as const,
      allowed: [...STARTER_ALLOWED],
      blocked: [...STARTER_BLOCKED]
    };
  }

  private hasPermission(actor: ActorContext, permission: string): boolean {
    return actor.roles.some((role) => roleHasPermission(role, permission));
  }

  private refuse(actor: ActorContext, targetType: string, targetId: string, reason: string): never {
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterActionBlockedLicenseOrScope,
      targetType,
      targetId,
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "refused",
      reason,
      context: {}
    });
    throw new Error("Starter broker access denied");
  }
}
