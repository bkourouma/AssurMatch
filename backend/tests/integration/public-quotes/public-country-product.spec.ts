import { describe, expect, it } from "vitest";
import { seedComparatorQuote } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("public country and product journey", () => {
  it("exposes enabled country/product and blocks disabled deep URLs", () => {
    const { app, countryId } = seedComparatorQuote();

    const country = app.countries.service.getPublicPage("CI", { public_comparator_enabled: true, quote_request_enabled: true }, superAdminActor);
    expect(country.technicalRoleNotice).toContain("plateforme technique");

    const products = app.products.service.listPublicForCountry(countryId, app.countries.service.require(countryId).flags, { public_comparator_enabled: true, quote_request_enabled: true });
    expect(products.map((product) => product.key)).toContain("auto");

    expect(() => app.countries.service.getPublicPage("ZZ", { public_comparator_enabled: true }, superAdminActor)).toThrow("Country is not publicly available");
  });
});
