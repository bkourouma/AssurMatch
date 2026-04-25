import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("compliance page exposes evidence review shell", async () => {
  const source = readFileSync("apps/admin/app/compliance/page.tsx", "utf8");
  expect(source).toContain("Preuves de conformite");
  expect(source).toContain("Consentements");
});
