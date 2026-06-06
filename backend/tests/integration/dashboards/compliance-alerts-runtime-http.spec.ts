import { afterEach, describe, expect, it } from "vitest";
import type { ComplianceAlertsResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("compliance alerts runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("returns paginated compliance alerts, enforces page size bounds and audits reads", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_starter" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000000701",
      partnerPlan: "starter" as const,
      mfaVerified: true
    };
    await harness.request("/admin/dashboard", { headers: actorHeaders(broker) });

    const response = await harness.request("/admin/dashboard/compliance-alerts?page=1&pageSize=1", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const alerts = await readJson<ComplianceAlertsResponse>(response);
    expect(alerts.page).toBe(1);
    expect(alerts.pageSize).toBe(1);
    expect(alerts.total).toBeGreaterThan(0);
    expect(alerts.items).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminComplianceAlertsRead })[0]?.result).toBe("success");

    const invalidResponse = await harness.request("/admin/dashboard/compliance-alerts?pageSize=101", { headers: actorHeaders(admin) });
    expect(invalidResponse.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses broker access to compliance alerts and audits the admin refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_starter" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000000702",
      partnerPlan: "starter" as const,
      mfaVerified: true
    };
    const response = await harness.request("/admin/dashboard/compliance-alerts", { headers: actorHeaders(broker) });
    expect(response.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRefused })[0]?.reason).toBe("forbidden_role");
  });
});
