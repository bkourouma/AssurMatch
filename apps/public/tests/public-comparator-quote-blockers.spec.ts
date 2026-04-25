import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public comparator blocker states are visible in source", async () => {
  const product = readFileSync("apps/public/app/countries/[countryCode]/products/[productKey]/page.tsx", "utf8");
  const form = readFileSync("apps/public/app/components/quote-form.tsx", "utf8");
  const confirmation = readFileSync("apps/public/app/quote-requests/[publicReference]/page.tsx", "utf8");

  expect(product).toContain("non validees");
  expect(form).toContain("n'est pas disponible");
  expect(confirmation).toContain("aucun courtier partenaire eligible");
});
