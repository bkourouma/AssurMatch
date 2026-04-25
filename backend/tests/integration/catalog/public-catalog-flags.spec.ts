import { describe, expect, it } from "vitest";
import { seedMiniCatalog, superAdminActor } from "../helpers/enterprise-seed";

describe("public catalog flags", () => {
  it("hides disabled countries and products from public reads", () => {
    const { countries, products, country, product } = seedMiniCatalog();

    expect(countries.listPublic()).toHaveLength(0);
    expect(products.listPublic(country.id)).toHaveLength(0);

    countries.update(country.id, {
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010",
      status: "public",
      flags: { country_public_enabled: true },
      reason: "pilot public catalog"
    }, superAdminActor);
    products.update(product.id, {
      status: "public",
      flags: { product_public_enabled: true },
      reason: "pilot product public catalog"
    }, superAdminActor);

    expect(countries.listPublic()).toHaveLength(1);
    expect(products.listPublic(country.id)).toHaveLength(1);
  });
});
