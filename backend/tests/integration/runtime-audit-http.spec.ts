import { afterEach, describe, expect, it } from "vitest";
import { actorHeaders, createRuntimeHttpHarness, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("runtime audit HTTP refusals", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("persists audit entries after tenant refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const actor = { actorId: "starter-owner", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-a", partnerPlan: "starter" as const, mfaVerified: true };
    const other = harness.runtime.leads.assignments.create({ quoteRequestId: "q-runtime-b", partnerTenantId: "broker-b", assignmentReason: "routing", publicReference: "AM-B" }, { ...actor, partnerTenantId: "broker-b" });

    expect((await harness.request(`/broker/starter/leads/${other.id}`, { headers: actorHeaders(actor) })).status).toBe(403);
    expect(harness.runtime.audit.writer.all().some((entry) => entry.result === "refused")).toBe(true);
  });
});
