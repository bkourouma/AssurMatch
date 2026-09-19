import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_WEIGHTS, scoringWeightsSchema } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import { scoreOffers } from "../../../src/modules/offers/offer-scoring";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";

function offer(id: string, overrides: Partial<OfferRecord> = {}): OfferRecord {
  return {
    id,
    countryId: "c",
    productId: "p",
    publicKey: id,
    name: `Offer ${id}`,
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

describe("scoreOffers", () => {
  it("defaults total 100 and every breakdown sums to its total", () => {
    expect(scoringWeightsSchema.parse(DEFAULT_SCORING_WEIGHTS)).toEqual(DEFAULT_SCORING_WEIGHTS);
    const scores = scoreOffers([
      offer("a", { indicativePriceMin: 10000, guaranteeLevel: 4, deductibleAmount: 20000, processingDelayDays: 2, paymentFlexibility: "monthly" }),
      offer("b", { indicativePriceMin: 20000, guaranteeLevel: 2, deductibleAmount: 40000, processingDelayDays: 6, paymentFlexibility: "annual" })
    ], DEFAULT_SCORING_WEIGHTS);
    for (const score of scores.values()) {
      expect(score.breakdown).toHaveLength(7);
      expect(Math.abs(score.breakdown.reduce((sum, line) => sum + line.points, 0) - score.total)).toBeLessThanOrEqual(1);
      expect(score.label).toContain("indicatif");
      expect(score.label).not.toContain("meilleure");
    }
    expect(scores.get("a")!.total).toBeGreaterThan(scores.get("b")!.total);
  });

  it("scores missing data as zero with an explanation", () => {
    const scores = scoreOffers([offer("bare", { indicativePriceMin: 5000 })], DEFAULT_SCORING_WEIGHTS);
    const bare = scores.get("bare")!;
    const guarantee = bare.breakdown.find((line) => line.criterion === "guaranteeLevel")!;
    expect(guarantee.score).toBe(0);
    expect(guarantee.explanation).toContain("non renseigne");
    expect(bare.breakdown.find((line) => line.criterion === "price")!.score).toBe(1);
  });

  it("lets the visitor preference drive the userPreferences slot", () => {
    const offers = [
      offer("cheap", { indicativePriceMin: 5000, guaranteeLevel: 1 }),
      offer("covered", { indicativePriceMin: 50000, guaranteeLevel: 5 })
    ];
    const priceFirst = scoreOffers(offers, DEFAULT_SCORING_WEIGHTS, "price");
    const guaranteesFirst = scoreOffers(offers, DEFAULT_SCORING_WEIGHTS, "guarantees");
    expect(priceFirst.get("cheap")!.breakdown.find((line) => line.criterion === "userPreferences")!.score).toBe(1);
    expect(priceFirst.get("cheap")!.breakdown.find((line) => line.criterion === "userPreferences")!.explanation).toContain("le prix");
    expect(guaranteesFirst.get("covered")!.breakdown.find((line) => line.criterion === "userPreferences")!.score).toBe(1);
  });

  it("applies admin weights, e.g. price-only weighting ranks the cheapest at 100", () => {
    const weights = { guaranteeLevel: 0, price: 100, deductible: 0, processingSpeed: 0, paymentFlexibility: 0, informationQuality: 0, userPreferences: 0 };
    const scores = scoreOffers([offer("a", { indicativePriceMin: 1000, guaranteeLevel: 1 }), offer("b", { indicativePriceMin: 2000, guaranteeLevel: 5 })], weights);
    expect(scores.get("a")!.total).toBe(100);
    expect(scores.get("b")!.total).toBe(50);
  });

  it("rejects weights that do not total 100", () => {
    expect(() => scoringWeightsSchema.parse({ ...DEFAULT_SCORING_WEIGHTS, price: 30 })).toThrow(/weights_must_total_100/);
  });
});
