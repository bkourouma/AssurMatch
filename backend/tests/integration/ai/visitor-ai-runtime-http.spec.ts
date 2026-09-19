import { afterEach, describe, expect, it } from "vitest";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import { createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

async function enableVisitorAi(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>) {
  for (const key of ["ai_summary_enabled", "ai_recommendation_enabled"]) {
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "visitor ai runtime test" }, seed.admin, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  }
  await harness.runtime.countries.service.update(seed.country.id, { flags: { ...seed.country.flags, country_ai_enabled: true }, reason: "visitor ai runtime test" }, seed.admin);
  await harness.runtime.products.service.update(seed.product.id, { flags: { ...seed.product.flags, product_ai_form_assistant_enabled: true }, reason: "visitor ai runtime test" }, seed.admin);
}

describe("visitor AI assistance runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("queues, processes and exposes an indicative product orientation with disclaimer", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await enableVisitorAi(harness, seed);

    const availability = await readJson<Array<{ assistType: string; enabled: boolean }>>(await harness.request("/ai/visitor/availability?countryCode=CI&productKey=auto"));
    expect(availability.find((entry) => entry.assistType === "visitor_product_assistant")?.enabled).toBe(true);

    const queued = await harness.request("/ai/visitor/visitor_product_assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
      body: JSON.stringify({ countryCode: "CI", productKey: "auto", need: "Je veux proteger ma voiture, contactez moi sur ama@example.test" })
    });
    expect(queued.status).toBe(201);
    const interaction = aiInteractionSchema.parse(await readJson(queued));
    expect(interaction.status).toBe("queued");

    expect(await harness.runtime.aiGateway.processPending()).toBe(1);
    const done = aiInteractionSchema.parse(await readJson(await harness.request(`/ai/visitor/interactions/${interaction.id}`)));
    expect(done.status).toBe("completed");
    expect(done.outputText).toContain("pourrait correspondre");
    expect(done.outputText).toContain(done.disclaimer);
    expect(done.outputText).not.toContain("example.test");
    const completedAudit = harness.runtime.audit.writer.search({ action: AiAuditActions.completed })[0];
    expect(JSON.stringify(completedAudit)).not.toContain("proteger ma voiture");
    expect(completedAudit?.context).toMatchObject({ provider: "template" });
  });

  it("refuses when AI is disabled for the country and rate limits per IP", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "ai_recommendation_enabled", scopeType: "global", value: true, reason: "visitor ai runtime test" }, seed.admin, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });

    const disabled = await harness.request("/ai/visitor/visitor_faq", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.11" },
      body: JSON.stringify({ countryCode: "CI", question: "Comment fonctionne une franchise ?" })
    });
    expect(disabled.status).toBe(201);
    const refused = aiInteractionSchema.parse(await readJson(disabled));
    expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled", outputText: null });
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.refused })[0]?.context).toMatchObject({ modelCall: false });

    expect((await readJson<Array<{ assistType: string; enabled: boolean }>>(await harness.request("/ai/visitor/availability?countryCode=CI"))).every((entry) => !entry.enabled)).toBe(true);

    let last = 0;
    for (let index = 0; index < 21; index += 1) {
      last = (await harness.request("/ai/visitor/visitor_faq", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.12" },
        body: JSON.stringify({ countryCode: "CI", question: "Question numero " + index + " sur les franchises" })
      })).status;
    }
    expect(last).toBe(429);
    expect((await harness.request("/ai/visitor/not_a_type", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(400);
    expect((await harness.request("/ai/visitor/interactions/00000000-0000-4000-8000-000000000999")).status).toBe(404);
  });
});
