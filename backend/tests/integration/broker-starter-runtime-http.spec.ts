import { afterEach, describe, expect, it } from "vitest";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("broker Starter runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lists only tenant leads and refuses cross-tenant detail", async () => {
    harness = await createRuntimeHttpHarness();
    const actor = { actorId: "starter-owner", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-a", partnerPlan: "starter" as const, mfaVerified: true };
    const otherActor = { ...actor, actorId: "other-owner", partnerTenantId: "broker-b" };
    const own = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-runtime-a", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "AM-A" }, actor);
    const other = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-runtime-b", partnerTenantId: "broker-b", assignmentReason: "routing", publicReference: "AM-B" }, otherActor);

    const list = await readJson<{ items: Array<{ publicReference: string }> }>(await harness.request("/broker/starter/leads", { headers: actorHeaders(actor) }));
    expect(list.items.map((item) => item.publicReference)).toEqual([own.publicReference]);

    const denied = await harness.request(`/broker/starter/leads/${other.id}`, { headers: actorHeaders(actor) });
    expect(denied.status).toBe(403);

    const accepted = await harness.request(`/broker/starter/leads/${own.id}/accept`, { method: "POST", headers: actorHeaders(actor) });
    expect(accepted.status).toBe(201);
    const history = await readJson<unknown[]>(await harness.request(`/broker/starter/leads/${own.id}/history`, { headers: actorHeaders(actor) }));
    expect(history).toHaveLength(1);
    expect((await harness.runtime.leads.assignments.require(own.id)).status).toBe("accepted");
  });
});
