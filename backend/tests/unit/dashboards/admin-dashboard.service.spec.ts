import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { AdminDashboardService } from "../../../src/modules/dashboards/admin-dashboard.service";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";
import { DashboardsAccessPolicy } from "../../../src/modules/dashboards/dashboards-access-policy";

const countryId = "country-ci";
const partnerId = "00000000-0000-4000-8000-000000000301";
const productKey = "auto";

function makeService(audit = new AuditLogWriter()) {
  const now = new Date();
  const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  audit.write({
    actor: { actorId: "broker", roles: ["broker_owner_starter"], partnerTenantId: partnerId, mfaVerified: true },
    action: DashboardAuditActions.brokerDashboardRefused,
    targetType: "BrokerDashboard",
    targetId: "dashboard",
    scope: { partnerTenantId: partnerId, roles: ["broker_owner_starter"] },
    result: "refused",
    reason: "broker_crm_disabled",
    context: {}
  });
  return new AdminDashboardService({
    access: new DashboardsAccessPolicy(audit),
    audit,
    featureFlags: {
      list: () => [{ key: "broker_dashboard_enabled", scopeType: "global", value: true }]
    } as never,
    assignments: {
      list: async () => [{
        id: "assignment-1",
        quoteRequestId: "quote-1",
        partnerTenantId: partnerId,
        status: "accepted",
        assignedAt: past,
        assignmentReason: "routing",
        countryCode: "CI",
        productKey,
        createdAt: past,
        updatedAt: past
      }]
    } as never,
    decisions: {
      list: async () => [{ id: "decision-1", result: "blocked", reasons: ["consent_missing"], createdAt: past }]
    } as never,
    quoteRequests: {
      list: async () => [
        { id: "quote-1", countryId, productKey, createdAt: past },
        { id: "quote-2", countryId, productKey, createdAt: past }
      ]
    } as never,
    partnerLicenses: {
      listForPartner: async () => [{
        partnerTenantId: partnerId,
        countryId,
        expirationDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)
      }]
    } as never,
    partners: { list: async () => [{ id: partnerId, status: "active" }, { id: "partner-inactive", status: "suspended" }] } as never,
    offers: { repository: { list: async () => [{ status: "active", validUntil: new Date(now.getTime() - 24 * 60 * 60 * 1000) }] } } as never,
    countries: { listAdmin: async () => [{ id: countryId, isoCode: "CI" }] } as never
  });
}

describe("AdminDashboardService", () => {
  it("aggregates lead volumes, partners, offers, licenses, compliance and sensitive flags", async () => {
    const audit = new AuditLogWriter();
    const service = makeService(audit);
    const admin: ActorContext = { actorId: "admin", roles: ["super_admin"], mfaVerified: true };

    const dashboard = await service.dashboard(admin, {});

    expect(dashboard.leadVolumes).toMatchObject({ received: 2, transmitted: 1, refused: 1, nonRouted: 1 });
    expect(dashboard.nonRoutedReasons).toContainEqual({ reason: "consent_missing", total: 1 });
    expect(dashboard.byCountry).toContainEqual({ countryCode: "CI", total: 2 });
    expect(dashboard.byProduct).toContainEqual({ productKey, total: 2 });
    expect(dashboard.partners).toEqual({ active: 1, inactive: 1 });
    expect(dashboard.expiredOffersStillReferenced).toBe(1);
    expect(dashboard.licenseAlerts.expiringSoon).toBe(1);
    expect(dashboard.complianceAlertCounts.crmFlagClosed).toBe(1);
    expect(dashboard.sensitiveFeatureFlags).toContainEqual({ key: "broker_dashboard_enabled", scopeType: "global", scopeId: null, value: true });
    expect(audit.search({ action: DashboardAuditActions.adminDashboardRead })[0]?.result).toBe("success");
  });

  it("refuses Admin Pays partner filters outside scoped licensed countries", async () => {
    const audit = new AuditLogWriter();
    const service = makeService(audit);
    const adminPays: ActorContext = { actorId: "admin-pays", roles: ["admin_pays"], countryScopes: ["SN"], mfaVerified: true };

    await expect(service.dashboard(adminPays, { partnerId })).rejects.toThrow(/out_of_scope_partner/);
    expect(audit.search({ action: DashboardAuditActions.adminDashboardRefused })[0]?.reason).toBe("out_of_scope_partner");
  });

  it("fails closed for Finance and Content admins until restricted dashboard sections are modeled", async () => {
    const audit = new AuditLogWriter();
    const service = makeService(audit);
    await expect(service.dashboard({ actorId: "finance", roles: ["finance_admin"], mfaVerified: true }, {})).rejects.toThrow(/restricted_admin_dashboard_unavailable/);
    await expect(service.dashboard({ actorId: "content", roles: ["content_admin"], mfaVerified: true }, {})).rejects.toThrow(/restricted_admin_dashboard_unavailable/);
    expect(audit.search({ action: DashboardAuditActions.adminDashboardRefused }).map((entry) => entry.reason)).toEqual([
      "restricted_admin_dashboard_unavailable",
      "restricted_admin_dashboard_unavailable"
    ]);
  });
});
