import { afterEach, describe, expect, it } from "vitest";
import { actorHeaders, createRuntimeHttpHarness, type RuntimeHttpHarness } from "./runtime-http-test-utils";

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
    const response = await harness.request("/broker/crm/leads", { headers: actorHeaders(pro) });
    expect(response.status).toBe(200);
  });
});
