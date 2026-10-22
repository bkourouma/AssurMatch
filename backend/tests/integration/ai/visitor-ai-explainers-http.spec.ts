import { afterEach, describe, expect, it, vi } from "vitest";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { AiGenerateRequest, AiProviderPort } from "../../../src/modules/ai/core/ai-provider.port";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import { publishOffer } from "../helpers/offer-test-helpers";
import { createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

const JSON_HEADERS = { "content-type": "application/json" };
const PII_TEXT = "Appelez ama@example.test ou le +225 01 02 03 04 05 pour souscrire";

/** Opens every flag the visitor explainers need; each can be left closed to test the refusal. */
async function openAi(harness: RuntimeHttpHarness, seed: Seed, closed: "global" | "country" | "product" | undefined = undefined) {
  const { runtime } = harness;
  const flags = ["ai_summary_enabled", "ai_recommendation_enabled"].filter((key) => !(closed === "global" && key === "ai_summary_enabled"));
  for (const key of flags) {
    await runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "explainer runtime test" }, seed.admin, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  }
  const country = await runtime.countries.service.require(seed.country.id);
  await runtime.countries.service.update(country.id, { flags: { ...country.flags, country_ai_enabled: closed !== "country" }, reason: "explainer runtime test" }, seed.admin);
  const product = await runtime.products.service.require(seed.product.id);
  await runtime.products.service.update(product.id, { flags: { ...product.flags, product_ai_form_assistant_enabled: closed !== "product" }, reason: "explainer runtime test" }, seed.admin);
}

async function secondOffer(harness: RuntimeHttpHarness, seed: Seed, overrides: Record<string, unknown> = {}) {
  return publishOffer(harness.runtime.offers, {
    countryId: seed.country.id,
    productId: seed.product.id,
    partnerTenantId: seed.partner.id,
    name: "Auto Confort",
    shortDescription: "Formule complete pour particuliers",
    insurerName: "Assureur Alpha",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }, { key: "glass", label: "Bris de glace", included: false }],
    exclusionsSummary: "Conduite sans permis",
    deductibleAmount: 50000,
    coverageCeiling: 5000000,
    processingDelayDays: 3,
    indicativePriceMin: 8000,
    indicativePriceMax: 12000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    reason: "explainer offer seed",
    ...overrides
  }, seed.admin, seed.admin);
}

function post(harness: RuntimeHttpHarness, assistType: string, body: unknown, ip = "198.51.100.40") {
  return harness.request(`/ai/visitor/${assistType}`, { method: "POST", headers: { ...JSON_HEADERS, "x-forwarded-for": ip }, body: JSON.stringify(body) });
}

function primaryProvider(harness: RuntimeHttpHarness): AiProviderPort {
  return (harness.runtime as unknown as { aiProviders: { primary: AiProviderPort } }).aiProviders.primary;
}

async function readInteraction(harness: RuntimeHttpHarness, id: string) {
  return aiInteractionSchema.parse(await readJson(await harness.request(`/ai/visitor/interactions/${id}`)));
}

describe("visitor offer explainers runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
  });

  it("explains the guarantees of one published offer end to end, without personal data", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed);
    const offer = await secondOffer(harness, seed, { shortDescription: PII_TEXT });

    const availability = await readJson<Array<{ assistType: string; enabled: boolean }>>(await harness.request("/ai/visitor/availability?countryCode=CI&productKey=auto"));
    expect(availability.find((entry) => entry.assistType === "visitor_guarantee_explainer")?.enabled).toBe(true);
    expect(availability.find((entry) => entry.assistType === "visitor_compare_explainer")?.enabled).toBe(true);

    const provider = primaryProvider(harness);
    const spy = vi.spyOn(provider, "generate");
    const queued = await post(harness, "visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: offer.id, language: "fr" });
    expect(queued.status).toBe(201);
    const interaction = aiInteractionSchema.parse(await readJson(queued));
    expect(interaction.status).toBe("queued");
    expect(spy).not.toHaveBeenCalled();

    expect(await harness.runtime.aiGateway.processPending()).toBe(1);
    const done = await readInteraction(harness, interaction.id);
    expect(done.status).toBe("completed");
    expect(done.outputText).toContain("Auto Confort");
    expect(done.outputText).toContain("Bris de glace");
    expect(done.outputText).toContain("a confirmer par le courtier partenaire");
    expect(done.outputText).toContain(done.disclaimer);
    expect(done.outputText).not.toContain("example.test");
    expect(done.outputText).not.toContain("01 02 03");

    const completedAudit = harness.runtime.audit.writer.search({ action: AiAuditActions.completed })[0];
    expect(completedAudit?.context).toMatchObject({ provider: "template" });
    expect(JSON.stringify(harness.runtime.audit.writer.search({}))).not.toContain("example.test");

    // The prompt and the stored input carry the offer data, minimised: no e-mail, no phone, no id.
    const request = spy.mock.calls[0]?.[0] as AiGenerateRequest;
    expect(request.user).toContain("Auto Confort");
    expect(request.user).toContain("[email]");
    expect(request.user).not.toContain("example.test");
    expect(request.user).not.toContain("01 02 03");
    expect(request.user).not.toContain(offer.id);
    const stored = await harness.runtime.aiGateway.find(interaction.id);
    expect(JSON.stringify(stored?.scope.minimizedInput)).not.toContain("example.test");
    expect(JSON.stringify(stored?.scope.minimizedInput)).toContain("offerName");
  });

  it("answers in English when asked", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed);
    const offer = await secondOffer(harness, seed);
    const interaction = aiInteractionSchema.parse(await readJson(await post(harness, "visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: offer.id, language: "en" })));
    await harness.runtime.aiGateway.processPending();
    const done = await readInteraction(harness, interaction.id);
    expect(done.status).toBe("completed");
    expect(done.outputText).toContain("Guarantees listed as included: Responsabilite civile");
  });

  it("compares 2 published offers neutrally and rejects invalid selections", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed);
    const cheaper = await secondOffer(harness, seed);
    const spy = vi.spyOn(primaryProvider(harness), "generate");

    const queued = await post(harness, "visitor_compare_explainer", { countryCode: "CI", productKey: "auto", offerIds: [seed.offer.id, cheaper.id], language: "fr" });
    expect(queued.status).toBe(201);
    const interaction = aiInteractionSchema.parse(await readJson(queued));
    await harness.runtime.aiGateway.processPending();
    const done = await readInteraction(harness, interaction.id);
    expect(done.status).toBe("completed");
    expect(done.outputText).toContain("Le prix indicatif le plus bas est celui de l'offre 2");
    expect(done.outputText).toContain("a confirmer par le courtier partenaire");
    expect(done.outputText).not.toMatch(/meilleur|conseill/i);
    const request = spy.mock.calls[0]?.[0] as AiGenerateRequest;
    for (const secret of [seed.offer.id, cheaper.id, seed.partner.id, "Broker CI Runtime"]) expect(request.user).not.toContain(secret);
    expect(request.user).toContain("offre 1");

    // Duplicated ids are de-duplicated: [a, a, b] still compares two offers.
    expect((await post(harness, "visitor_compare_explainer", { countryCode: "CI", productKey: "auto", offerIds: [seed.offer.id, seed.offer.id, cheaper.id] })).status).toBe(201);

    const product = await harness.runtime.products.service.create({ key: "sante", name: "Assurance sante" }, seed.admin);
    await harness.runtime.products.service.associateCountry(product.id, seed.country.id, seed.admin);
    // Another product: a draft offer is enough, the scope mismatch is refused before any visibility rule.
    const otherProduct = await harness.runtime.offers.adminService.create({
      countryId: seed.country.id, productId: product.id, name: "Sante Plus", currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z", reason: "other product offer"
    }, seed.admin);
    const draft = await harness.runtime.offers.adminService.create({
      countryId: seed.country.id, productId: seed.product.id, partnerTenantId: seed.partner.id, name: "Brouillon", currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z", reason: "draft offer"
    }, seed.admin);
    const extra = await Promise.all([1, 2, 3].map((index) => secondOffer(harness!, seed, { name: `Auto Extra ${index}` })));

    const body = (offerIds: string[]) => ({ countryCode: "CI", productKey: "auto", offerIds });
    expect((await post(harness, "visitor_compare_explainer", body([seed.offer.id]))).status).toBe(400);
    expect((await post(harness, "visitor_compare_explainer", body([seed.offer.id, seed.offer.id]))).status).toBe(400);
    expect((await post(harness, "visitor_compare_explainer", body([seed.offer.id, cheaper.id, ...extra.map((offer) => offer.id)]))).status).toBe(400);
    expect((await post(harness, "visitor_compare_explainer", body(["not-a-uuid", cheaper.id]))).status).toBe(400);
    const otherProductResponse = await post(harness, "visitor_compare_explainer", body([seed.offer.id, otherProduct.id]));
    expect(otherProductResponse.status).toBe(404);
    expect(JSON.stringify(await readJson(otherProductResponse))).toContain("Offer is not publicly available");
    expect((await post(harness, "visitor_compare_explainer", body([seed.offer.id, draft.id]))).status).toBe(404);
    expect((await post(harness, "visitor_compare_explainer", body([seed.offer.id, "00000000-0000-4000-8000-000000000999"]))).status).toBe(404);
    expect((await post(harness, "visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: draft.id })).status).toBe(404);
    expect((await post(harness, "visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: otherProduct.id })).status).toBe(404);
  });

  it.each([["global"], ["country"], ["product"]] as const)("refuses without any provider call when the %s flag is closed", async (closed) => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed, closed);
    const other = await secondOffer(harness, seed);
    const spy = vi.spyOn(primaryProvider(harness), "generate");

    const availability = await readJson<Array<{ assistType: string; enabled: boolean }>>(await harness.request("/ai/visitor/availability?countryCode=CI&productKey=auto"));
    expect(availability.find((entry) => entry.assistType === "visitor_compare_explainer")?.enabled).toBe(false);

    for (const [type, body] of [
      ["visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: other.id }],
      ["visitor_compare_explainer", { countryCode: "CI", productKey: "auto", offerIds: [seed.offer.id, other.id] }]
    ] as const) {
      const response = await post(harness, type, body);
      expect(response.status).toBe(201);
      expect(aiInteractionSchema.parse(await readJson(response))).toMatchObject({ status: "refused", refusalReason: "ai_disabled", outputText: null });
    }
    expect(await harness.runtime.aiGateway.processPending()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    const refusals = harness.runtime.audit.writer.search({ action: AiAuditActions.refused });
    expect(refusals).toHaveLength(2);
    expect(refusals.every((entry) => (entry.context as { modelCall?: boolean }).modelCall === false)).toBe(true);
  });

  it("withholds a provider output that recommends a choice", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed);
    const other = await secondOffer(harness, seed);
    const provider = primaryProvider(harness);

    for (const text of ["Nous vous conseillons l'offre 2, souscrivez.", "You should choose offer 1."]) {
      vi.spyOn(provider, "generate").mockResolvedValue({ text, model: "stub" });
      const interaction = aiInteractionSchema.parse(await readJson(await post(harness, "visitor_compare_explainer", { countryCode: "CI", productKey: "auto", offerIds: [seed.offer.id, other.id] })));
      await harness.runtime.aiGateway.processPending();
      const done = await readInteraction(harness, interaction.id);
      expect(done.status).toBe("refused");
      expect(done.outputText).toBeNull();
      expect(done.refusalReason).toContain("guardrail_violation");
      vi.restoreAllMocks();
    }
  });

  it("rate limits the explainers per IP", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed);
    let last = 0;
    for (let index = 0; index < 21; index += 1) {
      last = (await post(harness, "visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: seed.offer.id }, "198.51.100.77")).status;
    }
    expect(last).toBe(429);
  });

  it("runs visitor_form_help end to end and refuses it when the product flag is closed", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await openAi(harness, seed);
    const body = { countryCode: "CI", productKey: "auto", fieldKey: "vehicle_use", fieldLabel: "Usage du vehicule" };
    const queued = aiInteractionSchema.parse(await readJson(await post(harness, "visitor_form_help", body)));
    expect(queued.status).toBe("queued");
    await harness.runtime.aiGateway.processPending();
    const done = await readInteraction(harness, queued.id);
    expect(done.status).toBe("completed");
    expect(done.outputText).toContain("Usage du vehicule");
    expect(done.outputText).toContain(done.disclaimer);

    const english = aiInteractionSchema.parse(await readJson(await post(harness, "visitor_form_help", { ...body, language: "en" })));
    await harness.runtime.aiGateway.processPending();
    expect((await readInteraction(harness, english.id)).outputText).toContain("helps the partner broker");

    const product = await harness.runtime.products.service.require(seed.product.id);
    await harness.runtime.products.service.update(product.id, { flags: { ...product.flags, product_ai_form_assistant_enabled: false }, reason: "close product ai" }, seed.admin);
    const spy = vi.spyOn(primaryProvider(harness), "generate");
    const refused = aiInteractionSchema.parse(await readJson(await post(harness, "visitor_form_help", body)));
    expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled", outputText: null });
    expect(await harness.runtime.aiGateway.processPending()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
