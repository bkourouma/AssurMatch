import { describe, expect, it } from "vitest";
import { seedMiniCatalog, superAdminActor } from "../helpers/enterprise-seed";

describe("public catalog flags", () => {
  it("hides disabled countries and products from public reads", async () => {
    const { countries, products, country, product } = await seedMiniCatalog();

    expect(await countries.listPublic()).toHaveLength(0);
    expect(await products.listPublic(country.id)).toHaveLength(0);

    await countries.update(country.id, {
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010",
      status: "public",
      flags: { country_public_enabled: true },
      reason: "pilot public catalog"
    }, superAdminActor);
    await products.update(product.id, {
      status: "public",
      flags: { product_public_enabled: true },
      reason: "pilot product public catalog"
    }, superAdminActor);

    expect(await countries.listPublic()).toHaveLength(1);
    expect(await products.listPublic(country.id)).toHaveLength(1);
  });
});
