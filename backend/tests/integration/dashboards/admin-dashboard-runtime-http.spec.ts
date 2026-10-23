import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardResponse, ComplianceAlertsResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { adminDashboardResponseSchema } from "../../../../packages/shared/contracts/dashboard.contracts";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";

describe("admin dashboard runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("returns admin aggregates for super admin and writes a dashboard.admin.read audit", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "super-admin", roles: ["super_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/dashboard", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const dashboard = await readJson<AdminDashboardResponse>(response);
    expect(dashboard.scope.role).toBe("super_admin");
    expect(typeof dashboard.leadVolumes.received).toBe("number");
    expect(dashboard.sensitiveFeatureFlags.length).toBeGreaterThan(0);
    const audits = harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRead });
    expect(audits.length).toBe(1);
    expect(audits[0]?.result).toBe("success");
  });

  // Lot 6 (spec 073 T305)
  it("returns the extra PRD KPIs additively, with revenue for the super admin only and no AI call", async () => {
    harness = await createRuntimeHttpHarness();
    await harness.runtime.visitStats.service.record("home");
    await harness.runtime.visitStats.service.record("home");
    const providerCalls = vi.spyOn(harness.runtime.aiGateway, "run");
    const admin = { actorId: "super-admin", roles: ["super_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/dashboard", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const dashboard = await readJson<AdminDashboardResponse>(response);
    expect(adminDashboardResponseSchema.safeParse(dashboard).success).toBe(true);
    expect(dashboard.visits?.total).toBe(2);
    expect(typeof dashboard.activeCountries).toBe("number");
    expect(typeof dashboard.activeProducts).toBe("number");
    expect(dashboard.partnerSla).toEqual({ averageFirstActionMinutes: null, measured: 0 });
    expect(dashboard.leadQuality).toMatchObject({ transmitted: 0, disputed: 0, disputeRate: null });
    expect(dashboard.revenueRestricted).toBe(false);
    expect(dashboard.revenue).toEqual({ byCurrency: [] });
    expect(dashboard.aiEnabled).toBe(false);
    expect(dashboard.aiSummary).toBeNull();
    expect(providerCalls).not.toHaveBeenCalled();
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminRevenueRead })).toHaveLength(1);

    const compliance = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
    const restricted = await readJson<AdminDashboardResponse>(await harness.request("/admin/dashboard", { headers: actorHeaders(compliance) }));
    expect(restricted.revenueRestricted).toBe(true);
    expect(restricted.revenue).toBeUndefined();
    expect(restricted.visits?.total).toBe(2);
  });
  // Lot 6 (end)

  it("denies broker actor reaching admin dashboard with structured refusal audit", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = { actorId: "starter-owner", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-tenant-1", partnerPlan: "starter" as const, mfaVerified: true };
    const response = await harness.request("/admin/dashboard", { headers: actorHeaders(broker) });
    expect(response.status).toBe(403);
    const audits = harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRefused });
    expect(audits[0]?.reason).toBe("forbidden_role");
  });

  it("refuses Admin Pays out-of-scope country with audit", async () => {
    harness = await createRuntimeHttpHarness();
    const adminPays = { actorId: "ap", roles: ["admin_pays" as const], mfaVerified: true, countryScopes: ["CI"] };
    const response = await harness.request("/admin/dashboard?country=FR", { headers: actorHeaders(adminPays) });
    expect(response.status).toBe(403);
    const audits = harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRefused });
    expect(audits[0]?.reason).toBe("out_of_scope_country");
  });

  it("fails closed for Finance Admin until restricted dashboard sections have a dedicated DTO", async () => {
    harness = await createRuntimeHttpHarness();
    const financeAdmin = { actorId: "finance", roles: ["finance_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/dashboard", { headers: actorHeaders(financeAdmin) });
    expect(response.status).toBe(403);
    const audits = harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRefused });
    expect(audits[0]?.reason).toBe("restricted_admin_dashboard_unavailable");
  });

  it("returns paginated compliance alerts and audits the read", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
    const broker = { actorId: "starter-x", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-tenant-x", partnerPlan: "starter" as const, mfaVerified: true };
    await harness.request("/admin/dashboard", { headers: actorHeaders(broker) });
    const response = await harness.request("/admin/dashboard/compliance-alerts?page=1&pageSize=10", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const alerts = await readJson<ComplianceAlertsResponse>(response);
    expect(alerts.page).toBe(1);
    expect(alerts.pageSize).toBe(10);
    expect(alerts.total).toBeGreaterThan(0);
    const audits = harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminComplianceAlertsRead });
    expect(audits.length).toBe(1);
  });
});
