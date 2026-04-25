import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public country and product pages expose technical platform journey", async () => {
  const country = readFileSync("apps/public/app/countries/[countryCode]/page.tsx", "utf8");
  const product = readFileSync("apps/public/app/countries/[countryCode]/products/[productKey]/page.tsx", "utf8");

  expect(country).toContain("AssurMatch");
  expect(product).toContain("offres expirees");
  expect(country + product).toContain("PublicJourneyActions");
});
