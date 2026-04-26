import { roleHasPermission, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { DashboardAuditActions } from "./dashboard-audit-actions";

export type AdminDashboardRole = "super_admin" | "admin_pays" | "compliance_admin" | "support_admin" | "finance_admin" | "content_admin";

const ADMIN_ROLE_ALLOW_LIST: ReadonlySet<AdminDashboardRole> = new Set<AdminDashboardRole>([
  "super_admin",
  "admin_pays",
  "compliance_admin",
  "support_admin",
  "finance_admin",
  "content_admin"
]);

const BROKER_ROLES: ReadonlySet<AssurMatchRole> = new Set<AssurMatchRole>([
  "broker_owner_starter",
  "broker_owner_pro",
  "broker_manager",
  "broker_agent",
  "broker_read_only"
]);

export interface DashboardScopeInput {
  country?: string | undefined;
  product?: string | undefined;
  partnerId?: string | undefined;
  agentId?: string | undefined;
}

export interface ResolvedAdminScope {
  countries: string[];
  products: string[];
  partnerId: string | null;
  role: AdminDashboardRole;
}

export class DashboardAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Dashboard access denied: ${reason}`);
    this.name = "DashboardAccessRefusedError";
  }
}

export class DashboardsAccessPolicy {
  constructor(private readonly audit: AuditLogWriter) {}

  assertBrokerDashboardAccess(actor: ActorContext, brokerDashboardEnabled: boolean): void {
    if (!brokerDashboardEnabled) this.refuseBroker(actor, "broker_dashboard_disabled");
    if (!actor.partnerTenantId) this.refuseBroker(actor, "missing_broker_tenant");
    if (actor.mfaVerified !== true) this.refuseBroker(actor, "mfa_required");
    if (!actor.roles.some((role) => BROKER_ROLES.has(role))) this.refuseBroker(actor, "missing_broker_role");
    if (!actor.roles.some((role) => roleHasPermission(role, "broker_leads:read"))) {
      this.refuseBroker(actor, "missing_broker_read_permission");
    }
  }

  crmSectionAllowed(actor: ActorContext, brokerCrmEnabled: boolean): boolean {
    if (!brokerCrmEnabled) {
      this.audit.write({
        actor,
        action: DashboardAuditActions.brokerDashboardCrmRefused,
        targetType: "BrokerDashboard",
        targetId: "crm",
        scope: { partnerTenantId: actor.partnerTenantId },
        result: "refused",
        reason: "broker_crm_disabled",
        context: {}
      });
      return false;
    }
    if (actor.partnerPlan !== "pro" && actor.partnerPlan !== "enterprise") return false;
    return actor.roles.some((role) => roleHasPermission(role, "broker_crm:read")
      || roleHasPermission(role, "broker_crm:read_assigned")
      || roleHasPermission(role, "broker_crm:*"));
  }

  resolveAdminAccess(actor: ActorContext): AdminDashboardRole {
    if (actor.mfaVerified !== true) this.refuseAdmin(actor, "mfa_required");
    const role = (actor.roles as AdminDashboardRole[]).find((candidate) => ADMIN_ROLE_ALLOW_LIST.has(candidate));
    if (!role) this.refuseAdmin(actor, "forbidden_role");
    return role;
  }

  resolveAdminScope(actor: ActorContext, role: AdminDashboardRole, query: DashboardScopeInput): ResolvedAdminScope {
    const countryScopes = actor.countryScopes ?? [];
    const productScopes = actor.productScopes ?? [];
    let countries = query.country ? [query.country.toUpperCase()] : [...countryScopes];
    const products = query.product ? [query.product] : [...productScopes];
    if (role === "super_admin" || role === "compliance_admin") {
      // Super admin and compliance admin have implicit cross-scope; explicit query restricts further.
    } else if (role === "admin_pays") {
      if (query.country && countryScopes.length > 0 && !countryScopes.includes(query.country.toUpperCase())) {
        this.refuseAdmin(actor, "out_of_scope_country");
      }
      if (countries.length === 0 && countryScopes.length > 0) countries = [...countryScopes];
    } else if (role === "support_admin") {
      // Support admin reads cross-tenant aggregates but can be narrowed.
      if (query.country && countryScopes.length > 0 && !countryScopes.includes(query.country.toUpperCase())) {
        this.refuseAdmin(actor, "out_of_scope_country");
      }
    } else if (role === "finance_admin" || role === "content_admin") {
      if (query.country && countryScopes.length > 0 && !countryScopes.includes(query.country.toUpperCase())) {
        this.refuseAdmin(actor, "out_of_scope_country");
      }
      if (query.product && productScopes.length > 0 && !productScopes.includes(query.product)) {
        this.refuseAdmin(actor, "out_of_scope_product");
      }
    }
    return {
      countries,
      products,
      partnerId: query.partnerId ?? null,
      role
    };
  }

  refuseAdmin(actor: ActorContext, reason: string, action: string = DashboardAuditActions.adminDashboardRefused): never {
    this.audit.write({
      actor,
      action,
      targetType: "AdminDashboard",
      targetId: "dashboard",
      scope: { roles: actor.roles, mfaVerified: actor.mfaVerified ?? false },
      result: "refused",
      reason,
      context: {}
    });
    throw new DashboardAccessRefusedError(reason);
  }

  recordAdminSuccess(actor: ActorContext, scope: ResolvedAdminScope, window: { from: Date; to: Date }, action: string = DashboardAuditActions.adminDashboardRead): void {
    this.audit.write({
      actor,
      action,
      targetType: "AdminDashboard",
      targetId: "dashboard",
      scope: {
        countries: scope.countries,
        products: scope.products,
        partnerId: scope.partnerId,
        role: scope.role,
        windowFrom: window.from.toISOString(),
        windowTo: window.to.toISOString()
      },
      result: "success",
      context: {}
    });
  }

  private refuseBroker(actor: ActorContext, reason: string): never {
    this.audit.write({
      actor,
      action: DashboardAuditActions.brokerDashboardRefused,
      targetType: "BrokerDashboard",
      targetId: "dashboard",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "refused",
      reason,
      context: {}
    });
    throw new DashboardAccessRefusedError(reason);
  }
}
