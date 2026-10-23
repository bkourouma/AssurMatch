import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };

// Lot 6 (spec 073 T401): POST /admin/routing/precheck is a non-transmissive simulation.
describe("admin routing precheck runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  function post(actor: ActorContext, body: unknown) {
    return harness!.request("/admin/routing/precheck", {
      method: "POST",
      headers: { ...actorHeaders(actor), "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  it("evaluates a precheck as a simulation, audits it and creates no lead", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const response = await post(superAdmin, { countryId: seed.country.id, productId: seed.product.id, partnerTenantId: seed.partner.id });
    expect(response.status).toBe(201);
    const body = await readJson<{ result: string; reasons: string[]; notifiedBrokers: boolean; transmittedLead: boolean }>(response);
    expect(body.notifiedBrokers).toBe(false);
    expect(body.transmittedLead).toBe(false);
    expect(["eligible", "not_eligible"]).toContain(body.result);
    // No consent record was given: the precheck explains why it is not eligible.
    expect(body.result).toBe("not_eligible");
    expect(body.reasons).toContain("consent_missing_or_out_of_scope");

    const audits = harness.runtime.audit.writer.search({ action: "routing_precheck.evaluated" });
    expect(audits.length).toBe(1);

    const assignments = await readJson<{ items?: unknown[]; total?: number }>(await harness.request("/admin/lead-assignments", { headers: actorHeaders(superAdmin) }));
    expect(assignments.items ?? []).toHaveLength(0);
  });

  it("refuses roles outside the allow list and unauthenticated calls", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const payload = { countryId: seed.country.id, productId: seed.product.id, partnerTenantId: seed.partner.id };
    const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await post(broker, payload)).status).toBe(403);
    const adminPaysOther: ActorContext = { actorId: "ap-sn", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["SN"] };
    expect((await post(adminPaysOther, payload)).status).toBe(403);
    const noAuth = await harness.request("/admin/routing/precheck", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    expect([401, 403]).toContain(noAuth.status);
    expect(harness.runtime.audit.writer.search({ action: "routing_precheck.evaluated" })).toHaveLength(0);
  });

  it("rejects an invalid body with a 400", async () => {
    harness = await createRuntimeHttpHarness();
    const response = await post(superAdmin, { countryId: "not-a-uuid" });
    expect(response.status).toBe(400);
  });
});
