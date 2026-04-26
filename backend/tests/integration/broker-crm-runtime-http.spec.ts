import { afterEach, describe, expect, it } from "vitest";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("broker CRM runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  it("denies Starter and denies Pro when broker_crm_enabled is false", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "false";
    harness = await createRuntimeHttpHarness();
    const starter = { actorId: "starter", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-a", partnerPlan: "starter" as const, mfaVerified: true };
    const pro = { actorId: "pro", roles: ["broker_owner_pro" as const], partnerTenantId: "broker-a", partnerPlan: "pro" as const, mfaVerified: true };

    expect((await harness.request("/broker/crm/leads", { headers: actorHeaders(starter) })).status).toBe(403);
    expect((await harness.request("/broker/crm/leads", { headers: actorHeaders(pro) })).status).toBe(403);
  });

  it("allows Pro CRM reads when broker_crm_enabled is true", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    const pro = { actorId: "pro", roles: ["broker_owner_pro" as const], partnerTenantId: "broker-a", partnerPlan: "pro" as const, mfaVerified: true };
    const lead = harness.runtime.leads.assignments.create({ quoteRequestId: "q-crm-a", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "CRM-A" }, pro);
    const response = await harness.request("/broker/crm/leads", { headers: actorHeaders(pro) });
    expect(response.status).toBe(200);
    const page = await readJson<{ items: Array<{ leadAssignmentId: string; publicReference: string }> }>(response);
    expect(page.items).toEqual([{ leadAssignmentId: lead.id, publicReference: "CRM-A", countryCode: "CI", productKey: "unknown", status: "nouveau", assignedAt: lead.assignedAt.toISOString(), urgency: "normal", source: "quote_request" }]);
  });
});
