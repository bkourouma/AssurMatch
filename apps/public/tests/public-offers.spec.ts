import { expect, test } from "@playwright/test";
import { messagesText, publicPage, readSources } from "./helpers/public-sources";

test("public offers page sends the validated visitor sort to the API, default included", async () => {
  const list = readSources([publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx")]);

  // The API default is `updated_desc`; the page default is `score_desc` (FR-017). The sort is
  // resolved before the call and forwarded, so the select and the list order cannot disagree.
  const sortIndex = list.indexOf("const sort = sortOptionOf(first(filters.sort));");
  const callIndex = list.indexOf("listPublicOffers(countryCode, productKey, { ...filters, sort })");
  expect(sortIndex).toBeGreaterThan(-1);
  expect(callIndex).toBeGreaterThan(sortIndex);
  // The visitor sort list never carries the sponsored-first or name sorts of the shared enum.
  expect(list).toMatch(/const sortOptions = \["score_desc", "price_asc", "coverage_desc", "speed_asc", "popularity_desc", "updated_desc"\] as const;/);
  expect(list).toContain('(sortOptions as readonly string[]).includes(value) ? (value as SortOption) : "score_desc"');
  expect(list).not.toContain("listPublicOffers(countryCode, productKey, filters)");
});

test("public offers page includes filters, sponsorship and indicative wording", async () => {
  const list = readSources([publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx")]);
  const detail = readSources([publicPage("offers/[offerId]/page.tsx")]);

  // Structural: both pages still read their own namespace.
  expect(list).toContain('getTranslations("Offers")');
  expect(detail).toContain('getTranslations("OfferDetail")');

  // Copy: the filter label, the sponsorship notice and the detail heading now live in the catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("Budget indicatif : à partir de");
  expect(fr).toContain("offre sponsorisée est toujours signalée");
  expect(fr).toContain("Détail de l'offre indicative");
});
