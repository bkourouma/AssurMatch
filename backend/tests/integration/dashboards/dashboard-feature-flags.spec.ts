import { afterEach, describe, expect, it } from "vitest";
import type { AdminDashboardResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("dashboard feature flags", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("gates broker dashboard fail-closed while admin dashboard remains readable", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "admin", roles: ["super_admin" as const], mfaVerified: true };
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_starter" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000000401",
      partnerPlan: "starter" as const,
      mfaVerified: true
    };

    await harness.runtime.featureFlags.service.setFlag({
      key: "broker_dashboard_enabled",
      scopeType: "global",
      value: false,
      reason: "spec 012 feature flag test"
    }, admin);

    expect((await harness.request("/broker/dashboard", { headers: actorHeaders(broker) })).status).toBe(403);
    const adminResponse = await harness.request("/admin/dashboard", { headers: actorHeaders(admin) });
    expect(adminResponse.status).toBe(200);
    expect((await readJson<AdminDashboardResponse>(adminResponse)).scope.role).toBe("super_admin");
  });
});
