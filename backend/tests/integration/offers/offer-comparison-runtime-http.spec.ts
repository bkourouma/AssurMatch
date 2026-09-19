import { afterEach, describe, expect, it } from "vitest";
import { offerCompareResponseSchema, offerSummarySchema, scoringRuleSchema, scoringRulesResponseSchema } from "../../../../packages/shared/contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { ScoringAuditActions } from "../../../src/modules/offers/scoring-rules.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const priceHeavy = { guaranteeLevel: 10, price: 60, deductible: 10, processingSpeed: 5, paymentFlexibility: 5, informationQuality: 5, userPreferences: 5 };

async function createOffer(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, name: string, extra: Record<string, unknown>) {
  const response = await harness.request("/admin/offers", {
    method: "POST",
    headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
    body: JSON.stringify({
      countryId: seed.country.id,
      productId: seed.product.id,
      partnerTenantId: seed.partner.id,
      name,
      currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      reason: "comparison runtime seed",
      ...extra
    })
  });
  expect(response.status).toBe(201);
  const offer = await readJson<{ id: string }>(response);
  const validated = await harness.request(`/admin/offers/${offer.id}/validate`, {
    method: "POST",
    headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
    body: JSON.stringify({ validationStatus: "validated", reason: "comparison runtime validate" })
  });
  expect(validated.status).toBe(201);
  return offer;
}

describe("offer comparison runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("filters, scores, sorts and compares validated offers with responsible partner and popularity", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const premium = await createOffer(harness, seed, "Auto Premium", { indicativePriceMin: 90000, guaranteeLevel: 5, deductibleAmount: 10000, processingDelayDays: 3, paymentFlexibility: "monthly", insurerName: "Sunu", guarantees: [{ key: "vol", label: "Vol", included: true }] });
    const budget = await createOffer(harness, seed, "Auto Budget", { indicativePriceMin: 20000, guaranteeLevel: 2, deductibleAmount: 80000, processingDelayDays: 12, paymentFlexibility: "annual", guarantees: [{ key: "vol", label: "Vol", included: false }] });

    const filtered = await readJson<unknown[]>(await harness.request("/countries/CI/products/auto/offers?minGuaranteeLevel=3&maxDeductible=50000"));
    expect(filtered.map((item) => offerSummarySchema.parse(item).name)).toEqual(["Auto Premium"]);

    const scored = (await readJson<unknown[]>(await harness.request("/countries/CI/products/auto/offers?sort=score_desc&priority=guarantees"))).map((item) => offerSummarySchema.parse(item));
    expect(scored.map((item) => item.name)[0]).toBe("Auto Premium");
    expect(scored.every((item) => item.score && item.score.breakdown.length === 7 && item.partnerName === "Broker CI Runtime")).toBe(true);

    const comparison = offerCompareResponseSchema.parse(await readJson(await harness.request(`/offers/compare?ids=${premium.id},${budget.id}`)));
    expect(comparison.items.map((item) => item.name).sort()).toEqual(["Auto Budget", "Auto Premium", "Auto Runtime"].filter((name) => name !== "Auto Runtime"));
    expect(comparison.rows.find((row) => row.key === "guarantee:vol")?.values[premium.id]).toBe(true);
    expect((await harness.request(`/offers/compare?ids=${premium.id}`)).status).toBe(400);
    expect((await harness.request("/offers/compare?ids=00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002")).status).toBe(404);

    const detail = await readJson<{ name: string; guaranteeLevel?: number; partnerName?: string }>(await harness.request(`/offers/${premium.id}`));
    expect(detail).toMatchObject({ name: "Auto Premium", guaranteeLevel: 5, partnerName: "Broker CI Runtime" });
  });

  it("lets admins configure weights that change the score, with RBAC and audit", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await createOffer(harness, seed, "Cheap", { indicativePriceMin: 10000, guaranteeLevel: 1 });
    await createOffer(harness, seed, "Covered", { indicativePriceMin: 100000, guaranteeLevel: 5 });

    const before = (await readJson<unknown[]>(await harness.request("/countries/CI/products/auto/offers?sort=score_desc"))).map((item) => offerSummarySchema.parse(item));
    expect(before[0]?.name).toBe("Covered");

    const created = await harness.request("/admin/scoring-rules", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ countryId: seed.country.id, productId: seed.product.id, weights: priceHeavy, reason: "Price sensitive pilot" })
    });
    expect(created.status).toBe(201);
    scoringRuleSchema.parse(await readJson(created));
    const after = (await readJson<unknown[]>(await harness.request("/countries/CI/products/auto/offers?sort=score_desc"))).map((item) => offerSummarySchema.parse(item));
    expect(after[0]?.name).toBe("Cheap");

    const invalid = await harness.request("/admin/scoring-rules", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ weights: { ...priceHeavy, price: 50 }, reason: "bad" })
    });
    expect(invalid.status).toBe(400);

    const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await harness.request("/admin/scoring-rules", { headers: actorHeaders(broker) })).status).toBe(403);
    const contentAdmin: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };
    const list = scoringRulesResponseSchema.parse(await readJson(await harness.request("/admin/scoring-rules", { headers: actorHeaders(contentAdmin) })));
    expect(list.total).toBe(1);
    expect(harness.runtime.audit.writer.search({ action: ScoringAuditActions.ruleCreated })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: ScoringAuditActions.ruleRefused }).map((entry) => entry.reason)).toContain("forbidden_role");
  });

  it("refuses offer creation with forbidden wording and hides suspended offers", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const forbidden = await harness.request("/admin/offers", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ countryId: seed.country.id, productId: seed.product.id, name: "Contrat valide immediatement", currency: "XOF", validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z", reason: "forbidden wording" })
    });
    expect(forbidden.status).toBe(400);

    const offer = await createOffer(harness, seed, "Suspendable", { guaranteeLevel: 3 });
    expect((await readJson<Array<{ name: string }>>(await harness.request("/countries/CI/products/auto/offers"))).some((item) => item.name === "Suspendable")).toBe(true);
    const suspended = await harness.request(`/admin/offers/${offer.id}/suspend`, {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
      body: JSON.stringify({ reason: "Suspended for review" })
    });
    expect(suspended.status).toBe(201);
    expect((await readJson<Array<{ name: string }>>(await harness.request("/countries/CI/products/auto/offers"))).some((item) => item.name === "Suspendable")).toBe(false);
    const adminPaysSenegal: ActorContext = { actorId: "ap-sn", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["SN"] };
    const outOfScope = await harness.request("/admin/offers", {
      method: "POST",
      headers: { ...actorHeaders(adminPaysSenegal), "content-type": "application/json" },
      body: JSON.stringify({ countryId: seed.country.id, productId: seed.product.id, name: "Scoped", currency: "XOF", validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z", reason: "scope check" })
    });
    expect(outOfScope.status).toBe(403);
  });
});
