import { expect, test } from "@playwright/test";
import { messagesText, publicPage, readSources } from "./helpers/public-sources";

test("public offers page includes filters, sponsorship and indicative wording", async () => {
  const list = readSources([publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx")]);
  const detail = readSources([publicPage("offers/[offerId]/page.tsx")]);

  // Structural: both pages still read their own namespace.
  expect(list).toContain('getTranslations("Offers")');
  expect(detail).toContain('getTranslations("OfferDetail")');

  // Copy: the filter label, the sponsorship notice and the detail heading now live in the catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("Prix indicatif minimum");
  expect(fr).toContain("offre sponsorisée est toujours signalée");
  expect(fr).toContain("Détail de l'offre indicative");
});
