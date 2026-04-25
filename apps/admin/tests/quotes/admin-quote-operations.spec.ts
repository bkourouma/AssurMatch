import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("admin quote operations pages expose offers, requests and review state", async () => {
  const source = [
    "apps/admin/app/offers/page.tsx",
    "apps/admin/app/quote-requests/page.tsx",
    "apps/admin/app/operations/quote-review/page.tsx",
    "apps/admin/app/lead-assignments/page.tsx"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  expect(source).toContain("Offres indicatives");
  expect(source).toContain("Demandes de devis");
  expect(source).toContain("Revue operationnelle devis");
  expect(source).toContain("Routage des leads");
});
