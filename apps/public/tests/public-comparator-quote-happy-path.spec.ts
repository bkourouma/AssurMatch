import { expect, test } from "@playwright/test";
import { messagesText, publicPage, readSources } from "./helpers/public-sources";

test("public comparator quote happy path pages exist from country to confirmation", async () => {
  const files = readSources([
    publicPage("countries/[countryCode]/page.tsx"),
    publicPage("countries/[countryCode]/products/[productKey]/page.tsx"),
    publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx"),
    publicPage("countries/[countryCode]/products/[productKey]/quote/page.tsx"),
    publicPage("quote-requests/[publicReference]/page.tsx")
  ]);

  // Structural: one unique marker per step of the journey, still in the page sources.
  expect(files).toContain("BROKERS_ON_COUNTRY_PAGE");
  expect(files).toContain("PublicJourneyActions");
  expect(files).toContain("OfferComparisonBar");
  expect(files).toContain("QuoteFormShell");
  expect(files).toContain("ConsentWithdrawal");

  // Copy: the calls to action and the confirmation heading now live in the French catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("Comparer les offres");
  expect(fr).toContain("Demander un devis");
  expect(fr).toContain("Demande reçue");
});
