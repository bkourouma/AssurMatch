import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("local broker demo runtime reload guardrail", () => {
  it("keeps the feature flag reload endpoint local-only and seed-owned", async () => {
    const controller = readFileSync(join(process.cwd(), "backend", "src", "modules", "http-wiring", "runtime-http-wiring.module.ts"), "utf8");
    const seedScript = readFileSync(join(process.cwd(), "scripts", "local-app", "seed-broker-demo.ts"), "utf8");

    expect(controller).toContain('controller("local/dev", LocalDevRuntimeController)');
    expect(controller).toContain('Post("reload-feature-flags")');
    expect(controller).toContain('process.env.APP_ENV !== "local"');
    expect(controller).toContain('process.env.NODE_ENV === "production"');
    expect(controller).toContain('"x-assurmatch-local-dev"');
    expect(controller).toContain('"broker-demo-seed"');
    expect(controller).toContain("reloadRuntimeFeatureFlags()");

    expect(seedScript).toContain("reloadLocalRuntimeFeatureFlags()");
    expect(seedScript).toContain("/local/dev/reload-feature-flags");
    expect(seedScript).toContain('"x-assurmatch-local-dev": "broker-demo-seed"');
    expect(seedScript).toContain("runtimeReloaded");
  });
});
