import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("admin partner page exposes compliance workflow shell", async () => {
  const source = readFileSync("apps/admin/app/partners/page.tsx", "utf8");
  expect(source).toContain("Licences et agrements");
  expect(source).toContain("Activation bloquee");
});
