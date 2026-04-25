import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("admin catalog page exists with foundation wording", async () => {
  const source = readFileSync("apps/admin/app/catalog/page.tsx", "utf8");
  expect(source).toContain("Catalogue socle");
  expect(source).toContain("exposition publique desactivee");
});
