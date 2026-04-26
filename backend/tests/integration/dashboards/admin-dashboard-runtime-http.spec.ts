import { afterEach, describe, expect, it } from "vitest";
import type { AdminDashboardResponse, ComplianceAlertsResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
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
