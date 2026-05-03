import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { ComplianceAlertsService } from "../../../src/modules/dashboards/compliance-alerts.service";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";
import { DashboardsAccessPolicy } from "../../../src/modules/dashboards/dashboards-access-policy";

function makeService(audit = new AuditLogWriter()) {
  return new ComplianceAlertsService({ access: new DashboardsAccessPolicy(audit), audit });
}

function admin(overrides: Partial<ActorContext> = {}): ActorContext {
  return { actorId: "compliance-admin", roles: ["compliance_admin"], mfaVerified: true, ...overrides } as ActorContext;
}

describe("ComplianceAlertsService", () => {
  it("maps refusal categories, preserves actor roles from audit scope and paginates", () => {
    const audit = new AuditLogWriter();
    const service = makeService(audit);
    const actor = admin();
    audit.write({
      actor: { actorId: "broker-1", roles: ["broker_owner_starter"], partnerTenantId: "tenant-1", mfaVerified: true },
      action: DashboardAuditActions.brokerDashboardCrmRefused,
      targetType: "BrokerDashboard",
      targetId: "crm",
      scope: { partnerTenantId: "tenant-1", roles: ["broker_owner_starter"] },
      result: "refused",
      reason: "broker_crm_disabled",
      context: {}
    });
    audit.write({
      actor: { actorId: "broker-2", roles: ["broker_owner_starter"], partnerTenantId: "tenant-2", mfaVerified: true },
      action: DashboardAuditActions.brokerDashboardRefused,
      targetType: "BrokerDashboard",
      targetId: "dashboard",
      scope: { partnerTenantId: "tenant-2", roles: ["broker_owner_starter"] },
      result: "refused",
      reason: "missing_consent",
      context: {}
    });

    const firstPage = service.list(actor, { page: 1, pageSize: 1 });
    const crmOnly = service.list(actor, { category: "crm_flag_closed", page: 1, pageSize: 10 });

    expect(firstPage.total).toBe(2);
    expect(firstPage.items).toHaveLength(1);
    expect(crmOnly.total).toBe(1);
    expect(crmOnly.items[0]).toMatchObject({
      category: "crm_flag_closed",
      actorRoles: ["broker_owner_starter"],
      partnerTenantId: "tenant-1"
    });
    expect(audit.search({ action: DashboardAuditActions.adminComplianceAlertsRead }).length).toBe(2);
  });

  it("refuses non-admin roles through the dashboard access policy", () => {
    const audit = new AuditLogWriter();
    const service = makeService(audit);
    expect(() => service.list(admin({ roles: ["broker_owner_starter"] }), { page: 1, pageSize: 10 })).toThrow(/forbidden_role/);
    expect(audit.search({ action: DashboardAuditActions.adminDashboardRefused })[0]?.reason).toBe("forbidden_role");
  });
});
