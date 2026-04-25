import { describe, expect, it } from "vitest";
import { seedComparatorQuote } from "../helpers/comparator-quote-seed";

describe("public offers", () => {
  it("shows only active validated in-period indicative offers", () => {
    const seed = seedComparatorQuote();
    const offers = seed.app.offers.publicController.list(seed.countryId, seed.productId, { sort: "price_asc" });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.id).toBe(seed.activeOfferId);
    expect(offers[0]?.disclaimer).toContain("offre indicative");
    expect(() => seed.app.offers.publicController.detail(seed.expiredOfferId)).toThrow("Offer is not publicly available");
  });
});
