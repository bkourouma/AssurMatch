import { afterEach, describe, expect, it } from "vitest";
import { advisorPerformanceRowSchema, brokerDashboardResponseSchema } from "../../../../packages/shared/contracts/dashboard.contracts";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const TENANT = "00000000-0000-4000-8000-00000000d001";
const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true };
const readOnly: ActorContext = { actorId: "advisor-1", roles: ["broker_read_only"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true };

async function enableDashboard(harness: RuntimeHttpHarness) {
  await harness.runtime.featureFlags.service.setFlag({ key: "broker_dashboard_enabled", scopeType: "global", value: true, reason: "dashboard reports test" }, superAdmin);
  await harness.runtime.featureFlags.service.setFlag({ key: "broker_crm_enabled", scopeType: "global", value: true, reason: "dashboard reports test" }, superAdmin);
}

async function seedLeads(harness: RuntimeHttpHarness) {
  const now = Date.now();
  const current = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-rep-1", partnerTenantId: TENANT, assignmentReason: "routing", countryCode: "CI", productKey: "auto" }, superAdmin);
  const older = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-rep-2", partnerTenantId: TENANT, assignmentReason: "routing", countryCode: "CI", productKey: "auto" }, superAdmin);
  const other = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-rep-3", partnerTenantId: TENANT, assignmentReason: "routing", countryCode: "CI", productKey: "auto" }, superAdmin);
  current.assignedAdvisorId = "advisor-1";
  current.status = "accepted";
  current.seenAt = new Date(current.assignedAt.getTime() + 20 * 60_000);
  other.assignedAdvisorId = "advisor-2";
  // Push one lead into the previous window so the comparison has something to compare against.
  older.assignedAt = new Date(now - 40 * 24 * 3600 * 1000);
  older.assignedAdvisorId = "advisor-1";
  return { current, older, other };
}

describe("dashboard reports, comparison and advisor view", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousDashboardFlag = process.env.ASSURMATCH_BROKER_DASHBOARD_ENABLED;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_DASHBOARD_ENABLED = previousDashboardFlag;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  it("compares the previous window and exports aggregates without prospect identity", async () => {
    process.env.ASSURMATCH_BROKER_DASHBOARD_ENABLED = "true";
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    await enableDashboard(harness);
    await seedLeads(harness);

    const dashboard = brokerDashboardResponseSchema.parse(await readJson(await harness.request("/broker/dashboard?compare=previous", { headers: actorHeaders(owner) })));
    expect(dashboard.comparison).toBeDefined();
    expect(dashboard.comparison?.previous.received).toBe(1);
    expect(dashboard.comparison?.delta.received).toBe(dashboard.starter.received - 1);

    const csvResponse = await harness.request("/broker/dashboard/export.csv", { headers: actorHeaders(owner) });
    expect(csvResponse.status).toBe(200);
    const csv = await csvResponse.text();
    expect(csv.split("\n")[0]).toBe("section,dimension,valeur");
    expect(csv).toContain("volumes,received,");
    expect(csv).toContain("produit,auto,");
    expect(csv).not.toContain("@");
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.brokerExported })[0]?.context).toMatchObject({ containsProspectIdentity: false });
  });

  it("restricts the advisor view to the caller's own row for assigned-scope roles and gates exports", async () => {
    process.env.ASSURMATCH_BROKER_DASHBOARD_ENABLED = "true";
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    await enableDashboard(harness);
    await seedLeads(harness);

    const all = (await readJson<unknown[]>(await harness.request("/broker/dashboard/advisors", { headers: actorHeaders(owner) }))).map((row) => advisorPerformanceRowSchema.parse(row));
    expect(all.map((row) => row.advisorId).sort()).toEqual(["advisor-1", "advisor-2"]);
    expect(all.find((row) => row.advisorId === "advisor-1")).toMatchObject({ accepted: 1, averageFirstActionMinutes: 20 });
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.brokerAdvisorsRead })[0]?.context).toMatchObject({ rowCount: 2 });

    const own = (await readJson<unknown[]>(await harness.request("/broker/dashboard/advisors", { headers: actorHeaders(readOnly) }))).map((row) => advisorPerformanceRowSchema.parse(row));
    expect(own.map((row) => row.advisorId)).toEqual(["advisor-1"]);
    expect((await harness.request("/broker/dashboard/export.csv", { headers: actorHeaders(readOnly) })).status).toBe(403);
  });

  it("exports the admin dashboard within the admin scope and audits the row count", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await enableDashboard(harness);
    await seedLeads(harness);

    const response = await harness.request("/admin/dashboard/export.csv?compare=previous", { headers: actorHeaders(superAdmin) });
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("volumes,received,");
    expect(csv).toContain("partenaires,actifs,");
    expect(harness.runtime.audit.writer.search({ action: DashboardAuditActions.adminExported })[0]?.context).toMatchObject({ containsProspectIdentity: false });

    const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };
    expect((await harness.request("/admin/dashboard/export.csv", { headers: actorHeaders(finance) })).status).toBe(403);
  });
});
