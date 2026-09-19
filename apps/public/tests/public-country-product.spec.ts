import { expect, test } from "@playwright/test";
import { messagesText, publicPage, readSources } from "./helpers/public-sources";

test("public country and product pages expose technical platform journey", async () => {
  const country = readSources([publicPage("countries/[countryCode]/page.tsx")]);
  const product = readSources([publicPage("countries/[countryCode]/products/[productKey]/page.tsx")]);

  // Structural: the journey shortcuts component is used on the product page.
  expect(country + product).toContain("PublicJourneyActions");

  // Copy: the brand name and the "expired or unvalidated offer" wording now live in the catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("AssurMatch");
  expect(fr).toContain("offres expirées ou non validées");
});
