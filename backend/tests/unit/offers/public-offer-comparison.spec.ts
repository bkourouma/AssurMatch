import { describe, expect, it } from "vitest";
import { offerCompareResponseSchema, offerSummarySchema } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";
import { PublicOfferCatalogService } from "../../../src/modules/offers/public-offer-catalog.service";

const countryId = "00000000-0000-4000-8000-000000000030";
const productId = "00000000-0000-4000-8000-000000000040";
const partnerA = "00000000-0000-4000-8000-000000000050";
const partnerB = "00000000-0000-4000-8000-000000000051";

function offer(id: string, name: string, overrides: Partial<OfferRecord> = {}): OfferRecord {
  return {
    id,
    countryId,
    productId,
    publicKey: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    currency: "XOF",
    status: "active",
    validationStatus: "validated",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2030-01-01T00:00:00.000Z"),
    isSponsored: false,
    displayPriority: 0,
    publicDisclaimers: ["offre indicative"],
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

const ids = {
  premium: "00000000-0000-4000-8000-000000000101",
  budget: "00000000-0000-4000-8000-000000000102",
  fast: "00000000-0000-4000-8000-000000000103",
  otherProduct: "00000000-0000-4000-8000-000000000104"
};

function service() {
  return new PublicOfferCatalogService([
    offer(ids.premium, "Premium", { partnerTenantId: partnerA, insurerName: "Sunu Assurances", indicativePriceMin: 90000, guaranteeLevel: 5, deductibleAmount: 10000, coverageCeiling: 5_000_000, processingDelayDays: 5, paymentFlexibility: "monthly", guarantees: [{ key: "vol", label: "Vol", included: true }, { key: "bris", label: "Bris de glace", included: true }] }),
    offer(ids.budget, "Budget", { partnerTenantId: partnerB, insurerName: "NSIA", indicativePriceMin: 30000, guaranteeLevel: 2, deductibleAmount: 60000, processingDelayDays: 10, paymentFlexibility: "annual", guarantees: [{ key: "vol", label: "Vol", included: false }] }),
    offer(ids.fast, "Rapide", { partnerTenantId: partnerA, indicativePriceMin: 50000, guaranteeLevel: 3, deductibleAmount: 25000, processingDelayDays: 1, paymentFlexibility: "quarterly", guarantees: [{ key: "vol", label: "Vol", included: true }] }),
    offer(ids.otherProduct, "Autre produit", { productId: "00000000-0000-4000-8000-000000000041", indicativePriceMin: 1000 })
  ], new AuditLogWriter());
}

// Providing a context switches the flag gating on, so a test context must carry the activation flags.
const context = {
  globalFlags: { public_comparator_enabled: true, sponsored_offers_enabled: false },
  countryFlags: { country_public_enabled: true, country_comparison_enabled: true },
  productFlags: { product_public_enabled: true, product_comparison_enabled: true },
  resolvePartnerName: (partnerTenantId: string) => (partnerTenantId === partnerA ? "Courtage Abidjan" : "Courtage Dakar"),
  resolvePopularity: () => new Map([[ids.budget, 7], [ids.premium, 2]])
};

describe("PublicOfferCatalogService comparison criteria", () => {
  it("applies the new filters", async () => {
    const catalog = service();
    expect((await catalog.list(countryId, productId, { minGuaranteeLevel: 3 })).map((item) => item.name).sort()).toEqual(["Premium", "Rapide"]);
    expect((await catalog.list(countryId, productId, { maxDeductible: 25000 })).map((item) => item.name).sort()).toEqual(["Premium", "Rapide"]);
    expect((await catalog.list(countryId, productId, { maxProcessingDays: 5 })).map((item) => item.name).sort()).toEqual(["Premium", "Rapide"]);
    expect((await catalog.list(countryId, productId, { insurer: "nsia" })).map((item) => item.name)).toEqual(["Budget"]);
    expect((await catalog.list(countryId, productId, { guarantee: "bris" })).map((item) => item.name)).toEqual(["Premium"]);
    expect((await catalog.list(countryId, productId, { paymentFlexibility: "monthly" })).map((item) => item.name)).toEqual(["Premium"]);
  });

  it("sorts by coverage, speed, popularity and score and exposes partner names and update dates", async () => {
    const catalog = service();
    expect((await catalog.list(countryId, productId, { sort: "coverage_desc" })).map((item) => item.name)).toEqual(["Premium", "Rapide", "Budget"]);
    expect((await catalog.list(countryId, productId, { sort: "speed_asc" })).map((item) => item.name)).toEqual(["Rapide", "Premium", "Budget"]);
    expect((await catalog.list(countryId, productId, { sort: "popularity_desc" }, undefined, context)).map((item) => item.name)).toEqual(["Budget", "Premium", "Rapide"]);
    const scored = await catalog.list(countryId, productId, { sort: "score_desc", priority: "guarantees" }, undefined, context);
    expect(scored[0]?.name).toBe("Premium");
    for (const item of scored) {
      offerSummarySchema.parse(item);
      expect(item.score?.breakdown).toHaveLength(7);
      expect(item.updatedAt).toBe("2026-04-01T00:00:00.000Z");
    }
    expect(scored.find((item) => item.name === "Premium")?.partnerName).toBe("Courtage Abidjan");
    expect(scored.find((item) => item.name === "Budget")?.popularity).toBe(7);
  });

  it("compares 2 to 4 visible offers of the same product with aligned rows", async () => {
    const catalog = service();
    const response = await catalog.compare({ ids: `${ids.premium},${ids.budget},${ids.fast}` }, undefined, context);
    offerCompareResponseSchema.parse(response);
    expect(response.items).toHaveLength(3);
    expect(response.disclaimer).toContain("a confirmer par le courtier partenaire");
    const guaranteeRow = response.rows.find((row) => row.key === "guarantee:vol")!;
    expect(guaranteeRow.values[ids.premium]).toBe(true);
    expect(guaranteeRow.values[ids.budget]).toBe(false);
    expect(response.rows.find((row) => row.key === "partner")!.values[ids.budget]).toBe("Courtage Dakar");
    expect(response.rows.find((row) => row.key === "score")!.values[ids.premium]).toBeGreaterThan(0);
    await expect(catalog.compare({ ids: `${ids.premium},${ids.otherProduct}` })).rejects.toThrow(/same country and product/);
    await expect(catalog.compare({ ids: ids.premium })).rejects.toThrow();
    await expect(catalog.compare({ ids: `${ids.premium},00000000-0000-4000-8000-000000000999` })).rejects.toThrow(/not publicly available/);
  });
});
