import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("public runtime HTTP catalog", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("serves public countries products and valid offers through HTTP", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const countries = await readJson<unknown[]>(await harness.request("/countries"));
    expect(countries).toHaveLength(1);

    const products = await readJson<unknown[]>(await harness.request("/countries/CI/products"));
    expect(products).toHaveLength(1);

    const offers = await readJson<unknown[]>(await harness.request("/countries/CI/products/auto/offers"));
    expect(offers).toHaveLength(1);
    expect(await harness.runtime.countries.service.listPublic()).toHaveLength(1);
    expect(await harness.runtime.products.service.listPublic(seed.country.id)).toHaveLength(1);
  });
});
