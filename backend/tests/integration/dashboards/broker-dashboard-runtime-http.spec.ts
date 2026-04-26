import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BrokerDashboardResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("broker dashboard runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "false";
    harness = await createRuntimeHttpHarness();
    await harness.runtime.featureFlags.service.setFlag({
      key: "broker_dashboard_enabled",
      scopeType: "global",
      value: true,
      reason: "test enables broker dashboard for spec 012"
    }, { actorId: "test-admin", roles: ["super_admin"], mfaVerified: true });
    harness.runtime.featureFlags.service.isEnabled("broker_dashboard_enabled");
  });

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  it("returns Starter sections only for Starter actor and respects tenant scope", async () => {
    if (!harness) throw new Error("missing harness");
    const starter = { actorId: "starter-owner", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-tenant-1", partnerPlan: "starter" as const, mfaVerified: true };
    const otherStarter = { ...starter, actorId: "other-starter", partnerTenantId: "broker-tenant-2" };
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-tenant-1-a", partnerTenantId: starter.partnerTenantId, assignmentReason: "routing", publicReference: "T1-A", countryCode: "CI", productKey: "auto" }, starter);
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-tenant-1-b", partnerTenantId: starter.partnerTenantId, assignmentReason: "routing", publicReference: "T1-B", countryCode: "CI", productKey: "auto" }, starter);
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-tenant-2-a", partnerTenantId: otherStarter.partnerTenantId, assignmentReason: "routing", publicReference: "T2-A", countryCode: "CI", productKey: "auto" }, otherStarter);

    const response = await harness.request("/broker/dashboard", { headers: actorHeaders(starter) });
    expect(response.status).toBe(200);
    const dashboard = await readJson<BrokerDashboardResponse>(response);
    expect(dashboard.plan).toBe("starter");
    expect(dashboard.starter.received).toBe(2);
    expect(dashboard.crm).toBeUndefined();
  });

  it("refuses access fail-closed when broker_dashboard_enabled is disabled", async () => {
    if (!harness) throw new Error("missing harness");
    await harness.runtime.featureFlags.service.setFlag({
      key: "broker_dashboard_enabled",
      scopeType: "global",
      value: false,
      reason: "test disables broker dashboard"
    }, { actorId: "test-admin", roles: ["super_admin"], mfaVerified: true });
    const starter = { actorId: "starter-owner", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-tenant-1", partnerPlan: "starter" as const, mfaVerified: true };
    expect((await harness.request("/broker/dashboard", { headers: actorHeaders(starter) })).status).toBe(403);
  });

  it("includes CRM section for Pro when broker_crm_enabled=true and excludes when false", async () => {
    if (!harness) throw new Error("missing harness");
    const proActor = { actorId: "pro-owner", roles: ["broker_owner_pro" as const], partnerTenantId: "broker-pro-1", partnerPlan: "pro" as const, mfaVerified: true };
    const proLead = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-pro-1", partnerTenantId: proActor.partnerTenantId, assignmentReason: "routing", publicReference: "PRO-1", countryCode: "CI", productKey: "auto" }, proActor);
    await harness.runtime.leads.assignments.updateCrmMetadata(proLead.id, { assignedAdvisorId: "advisor-1" }, proActor);

    const offResponse = await harness.request("/broker/dashboard", { headers: actorHeaders(proActor) });
    expect(offResponse.status).toBe(200);
    const offDashboard = await readJson<BrokerDashboardResponse>(offResponse);
    expect(offDashboard.crm).toBeUndefined();

    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    await harness.runtime.reloadRuntimeFeatureFlags();
    const onResponse = await harness.request("/broker/dashboard", { headers: actorHeaders(proActor) });
    expect(onResponse.status).toBe(200);
    const onDashboard = await readJson<BrokerDashboardResponse>(onResponse);
    expect(onDashboard.crm).toBeDefined();
    expect(onDashboard.crm?.byAssignedAdvisor[0]).toEqual({ advisorId: "advisor-1", total: 1 });
  });

  it("rejects window spans greater than 365 days", async () => {
    if (!harness) throw new Error("missing harness");
    const starter = { actorId: "starter-owner", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-tenant-1", partnerPlan: "starter" as const, mfaVerified: true };
    const url = "/broker/dashboard?from=2024-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z";
    expect((await harness.request(url, { headers: actorHeaders(starter) })).status).toBeGreaterThanOrEqual(400);
  });
});
