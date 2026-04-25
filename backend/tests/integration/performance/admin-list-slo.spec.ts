import { describe, expect, it } from "vitest";
import { seedMiniCatalog } from "../helpers/enterprise-seed";

describe("admin list performance smoke", () => {
  it("keeps admin list reads well under 2 seconds for smoke data", () => {
    const { products } = seedMiniCatalog();
    const started = performance.now();
    products.listAdmin();
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2000);
  });
});
