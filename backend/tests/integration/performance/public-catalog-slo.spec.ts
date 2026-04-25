import { describe, expect, it } from "vitest";
import { seedMiniCatalog } from "../helpers/enterprise-seed";

describe("public catalog performance smoke", () => {
  it("keeps public catalog reads well under 1 second for smoke data", () => {
    const { countries } = seedMiniCatalog();
    const started = performance.now();
    countries.listPublic();
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
  });
});
