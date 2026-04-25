import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public comparator quote happy path pages exist from country to confirmation", async () => {
  const files = [
    "apps/public/app/countries/[countryCode]/page.tsx",
    "apps/public/app/countries/[countryCode]/products/[productKey]/page.tsx",
    "apps/public/app/countries/[countryCode]/products/[productKey]/offers/page.tsx",
    "apps/public/app/countries/[countryCode]/products/[productKey]/quote/page.tsx",
    "apps/public/app/quote-requests/[publicReference]/page.tsx"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  expect(files).toContain("Comparer les offres");
  expect(files).toContain("Demander un devis");
  expect(files).toContain("Demande recue");
});
