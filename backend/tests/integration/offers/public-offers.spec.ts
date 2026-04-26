import { describe, expect, it } from "vitest";
import { seedComparatorQuote } from "../helpers/comparator-quote-seed";

describe("public offers", () => {
  it("shows only active validated in-period indicative offers", async () => {
    const seed = await seedComparatorQuote();
    const offers = await seed.app.offers.publicController.list(seed.countryId, seed.productId, { sort: "price_asc" });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.id).toBe(seed.activeOfferId);
    expect(offers[0]?.disclaimer).toContain("offre indicative");
    await expect(seed.app.offers.publicController.detail(seed.expiredOfferId)).rejects.toThrow("Offer is not publicly available");
  });
});
