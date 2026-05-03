import { afterEach, describe, expect, it } from "vitest";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("dashboard audit payloads", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("records admin success payloads with scope, window and correlation id", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "admin", roles: ["super_admin" as const], mfaVerified: true, correlationId: "corr-dashboard-1" };
    const response = await harness.request("/admin/dashboard?country=CI", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);

    const audit = harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRead })[0];
    expect(audit).toMatchObject({ actorId: "admin", result: "success", correlationId: "corr-dashboard-1" });
    expect(audit?.scope).toMatchObject({ countries: ["CI"], role: "super_admin" });
    expect(audit?.scope.windowFrom).toEqual(expect.any(String));
    expect(audit?.scope.windowTo).toEqual(expect.any(String));
  });

  it("records admin and broker refusals with structured reasons", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_starter" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000000601",
      partnerPlan: "starter" as const,
      mfaVerified: true
    };
    await harness.request("/admin/dashboard", { headers: actorHeaders(broker) });
    await harness.request("/broker/dashboard", { headers: actorHeaders(broker) });

    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminDashboardRefused })[0]?.reason).toBe("forbidden_role");
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.brokerDashboardRefused })[0]?.reason).toBe("broker_dashboard_disabled");
  });
});
