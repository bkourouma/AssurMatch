import type {
  ComplianceAlertCategory,
  ComplianceAlertItem,
  ComplianceAlertsQuery,
  ComplianceAlertsResponse
} from "../../../../packages/shared/contracts/dashboard.contracts";
import type { ActorContext, AuditEntry } from "../common/types";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { DashboardsAccessPolicy } from "./dashboards-access-policy";
import { DashboardAuditActions } from "./dashboard-audit-actions";
import { isWithinWindow, resolveDashboardWindow } from "./dashboard-time-window";

const CONSENT_MISSING_MARKERS = ["consent_missing", "consent_invalid", "missing_consent", "consent_required", "consent_not_collected"];
const CRM_FLAG_CLOSED_MARKERS = ["broker_crm_disabled", "crm_flag_closed", "broker_crm_flag_disabled"];
const CROSS_TENANT_MARKERS = ["cross_tenant", "cross_tenant_access", "advisor_cross_tenant", "assignee_cross_tenant_or_unresolved"];
const RBAC_DENIED_MARKERS = ["forbidden_role", "rbac_denied", "missing_broker_read_permission", "missing_crm_read_permission", "missing_crm_update_permission", "missing_assigned_update_permission", "missing_assign_permission", "missing_export_permission", "starter_plan_blocks_crm_feature", "out_of_scope_country", "out_of_scope_product", "out_of_scope"];

export function categorizeAuditEntry(entry: AuditEntry): ComplianceAlertCategory {
  const reason = (entry.reason ?? "").toLowerCase();
  const action = entry.action.toLowerCase();
  if (CONSENT_MISSING_MARKERS.some((marker) => reason.includes(marker) || action.includes(marker))) return "consent_missing";
  if (CRM_FLAG_CLOSED_MARKERS.some((marker) => reason.includes(marker))) return "crm_flag_closed";
  if (CROSS_TENANT_MARKERS.some((marker) => reason.includes(marker) || action.includes(marker))) return "cross_tenant_attempt";
  if (RBAC_DENIED_MARKERS.some((marker) => reason.includes(marker) || action.includes(marker))) return "rbac_denied";
  return "other";
}

export interface ComplianceAlertsServiceDeps {
  access: DashboardsAccessPolicy;
  audit: AuditLogWriter;
}

export class ComplianceAlertsService {
  constructor(private readonly deps: ComplianceAlertsServiceDeps) {}

  list(actor: ActorContext, query: ComplianceAlertsQuery): ComplianceAlertsResponse {
    const role = this.deps.access.resolveAdminAccess(actor);
    const window = resolveDashboardWindow({ from: query.from, to: query.to });
    const allEntries = this.deps.audit.all().filter((entry) => entry.result === "refused" && isWithinWindow(entry.occurredAt, window));
    const items: ComplianceAlertItem[] = allEntries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      category: categorizeAuditEntry(entry),
      reason: entry.reason ?? entry.action,
      actorId: entry.actorId ?? null,
      actorRoles: this.extractRoles(entry),
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      partnerTenantId: this.extractPartnerTenantId(entry)
    }));
    const filtered = query.category ? items.filter((item) => item.category === query.category) : items;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);
    this.deps.audit.write({
      actor,
      action: DashboardAuditActions.adminComplianceAlertsRead,
      targetType: "AdminDashboard",
      targetId: "compliance-alerts",
      scope: { role, page, pageSize, ...(query.category ? { category: query.category } : {}) },
      result: "success",
      context: { total: filtered.length }
    });
    return {
      page,
      pageSize,
      total: filtered.length,
      items: paginated
    };
  }

  private extractRoles(_entry: AuditEntry): string[] {
    return [];
  }

  private extractPartnerTenantId(entry: AuditEntry): string | null {
    const scope = entry.scope as Record<string, unknown> | undefined;
    const value = scope?.partnerTenantId;
    return typeof value === "string" ? value : null;
  }
}
