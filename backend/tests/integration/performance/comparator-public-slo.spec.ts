import { describe, expect, it } from "vitest";
import { seedComparatorQuote } from "../helpers/comparator-quote-seed";

describe("comparator public read SLO", () => {
  it("serves country, product and offer reads under 2 seconds", async () => {
    const seed = await seedComparatorQuote();
    const start = performance.now();

    await seed.app.countries.service.getPublicPage("CI", { public_comparator_enabled: true, quote_request_enabled: true });
    await seed.app.products.service.getPublicProductPage(seed.countryId, "auto", (await seed.app.countries.service.require(seed.countryId)).flags);
    await seed.app.offers.publicController.list(seed.countryId, seed.productId);

    expect(performance.now() - start).toBeLessThan(2000);
  });
});
