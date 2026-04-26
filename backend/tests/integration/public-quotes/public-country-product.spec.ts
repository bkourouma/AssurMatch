import { describe, expect, it } from "vitest";
import { seedComparatorQuote } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("public country and product journey", () => {
  it("exposes enabled country/product and blocks disabled deep URLs", async () => {
    const { app, countryId } = await seedComparatorQuote();

    const country = await app.countries.service.getPublicPage("CI", { public_comparator_enabled: true, quote_request_enabled: true }, superAdminActor);
    expect(country.technicalRoleNotice).toContain("plateforme technique");

    const products = await app.products.service.listPublicForCountry(countryId, (await app.countries.service.require(countryId)).flags, { public_comparator_enabled: true, quote_request_enabled: true });
    expect(products.map((product) => product.key)).toContain("auto");

    await expect(app.countries.service.getPublicPage("ZZ", { public_comparator_enabled: true }, superAdminActor)).rejects.toThrow("Country is not publicly available");
  });
});
