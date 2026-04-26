import { describe, expect, it } from "vitest";
import { expectAuditAction } from "../helpers/audit-assertions";
import { seedMiniCatalog, superAdminActor } from "../helpers/enterprise-seed";

describe("admin catalog foundation", () => {
  it("creates country and products with audit evidence", async () => {
    const { audit, countries, products, country, product } = await seedMiniCatalog();
    const second = await products.create({ key: "home", name: "Habitation" }, superAdminActor);
    await products.associateCountry(second.id, country.id, superAdminActor);

    expect(await countries.listAdmin()).toHaveLength(1);
    expect((await products.listAdmin(country.id)).map((item) => item.id)).toEqual([product.id, second.id]);
    expectAuditAction(audit, "country.created");
    expectAuditAction(audit, "product.created");
  });
});
