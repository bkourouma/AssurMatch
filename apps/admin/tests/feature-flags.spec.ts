import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("feature flag page mentions fail-closed deactivation", async () => {
  const source = readFileSync("apps/admin/app/feature-flags/page.tsx", "utf8");
  expect(source).toContain("Desactivation rapide");
  expect(source).toContain("fail-closed");
  expect(source).toContain("Modules sensibles (lecture seule)");
  expect(source).toContain("sensitiveFeatureFlagKeys");
});
