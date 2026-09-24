import { afterEach, describe, expect, it } from "vitest";
import type { CountryUpdateDto } from "../../../../packages/shared/contracts/catalog.contracts";
import { seedMiniCatalog, superAdminActor } from "../helpers/enterprise-seed";
import { createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("catalog partial updates preserve unspecified state", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("keeps country status and untouched flags when the payload omits them", async () => {
    const { countries, country } = await seedMiniCatalog();
    await countries.update(country.id, {
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010",
      status: "public",
      flags: { country_public_enabled: true, country_comparison_enabled: true },
      reason: "activate public catalog"
    }, superAdminActor);

    const updated = await countries.update(country.id, {
      flags: { country_ai_enabled: true },
      reason: "enable ai assistant only"
    }, superAdminActor);

    expect(updated.status).toBe("public");
    expect(updated.flags.country_public_enabled).toBe(true);
    expect(updated.flags.country_comparison_enabled).toBe(true);
    expect(updated.flags.country_ai_enabled).toBe(true);
    expect(await countries.listPublic()).toHaveLength(1);
  });

  it("keeps country name and currency when the payload omits them", async () => {
    const { countries, country } = await seedMiniCatalog();
    const updated = await countries.update(country.id, { timezone: "Africa/Dakar", reason: "fix the timezone" }, superAdminActor);

    expect(updated.name).toBe("Cote d'Ivoire");
    expect(updated.currency).toBe("XOF");
    expect(updated.timezone).toBe("Africa/Dakar");
    expect(updated.status).toBe("draft");
  });

  it("keeps product status sensitivity and untouched flags when the payload omits them", async () => {
    const { products, product } = await seedMiniCatalog();
    await products.update(product.id, {
      status: "public",
      sensitivity: "sensitive",
      flags: { product_public_enabled: true, product_comparison_enabled: true },
      reason: "activate public product"
    }, superAdminActor);

    const updated = await products.update(product.id, {
      flags: { product_ai_scoring_enabled: true },
      reason: "enable ai scoring only"
    }, superAdminActor);

    expect(updated.status).toBe("public");
    expect(updated.sensitivity).toBe("sensitive");
    expect(updated.flags.product_public_enabled).toBe(true);
    expect(updated.flags.product_comparison_enabled).toBe(true);
    expect(updated.flags.product_ai_scoring_enabled).toBe(true);
  });

  it("forces manual review back on when a partial update raises the product sensitivity", async () => {
    const { products, product } = await seedMiniCatalog();
    await products.update(product.id, { requiresManualReview: false, reason: "standard product needs no review" }, superAdminActor);
    expect((await products.require(product.id)).requiresManualReview).toBe(false);

    const updated = await products.update(product.id, { sensitivity: "highly_sensitive", reason: "product now collects health data" }, superAdminActor);

    expect(updated.requiresManualReview).toBe(true);
  });

  it("does not take a live country offline over HTTP after an unrelated partial update", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    expect(await readJson<unknown[]>(await harness.request("/countries"))).toHaveLength(1);

    await harness.runtime.countries.service.update(seed.country.id, {
      name: "Cote d'Ivoire (RCI)",
      reason: "rename the country label"
    }, seed.admin);

    expect(await readJson<unknown[]>(await harness.request("/countries"))).toHaveLength(1);
    expect(await readJson<unknown[]>(await harness.request("/countries/CI/products"))).toHaveLength(1);
  });

  it("never writes the audit reason or a caller supplied id onto the country record", async () => {
    const { countries, country } = await seedMiniCatalog();
    // An untyped HTTP body can carry anything, so the schema has to drop `id` and `reason`.
    const rawPayload = {
      id: "00000000-0000-4000-8000-0000000000ff",
      name: "Cote d'Ivoire renamed",
      reason: "attempt to move the identifier"
    } as CountryUpdateDto;
    const updated = await countries.update(country.id, rawPayload, superAdminActor);

    expect(updated.id).toBe(country.id);
    expect(Object.keys(updated)).not.toContain("reason");
  });
});
