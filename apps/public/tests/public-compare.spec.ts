import { expect, test } from "@playwright/test";
import { messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";

test("public comparator exposes criteria filters, explainable score and side-by-side comparison", () => {
  const api = readSources([publicFile("lib/public-api.ts")]);
  const list = readSources([publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx")]);
  const cards = readSources([publicFile("components/offer-cards.tsx")]);
  const compare = readSources([publicPage("compare/page.tsx")]);
  const detail = readSources([publicPage("offers/[offerId]/page.tsx")]);
  const quote = readSources([publicPage("countries/[countryCode]/products/[productKey]/quote/page.tsx")]);

  // Structural: endpoints, filter keys and props still live in the sources.
  expect(api).toContain("/offers/compare");
  expect(api).toContain("minGuaranteeLevel");
  expect(quote).toContain("selectedOfferId");

  // Copy: the visible filter labels, actions and headings now live in the French catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("Niveau de garantie minimum");
  expect(fr).toContain("Franchise maximale");
  expect(fr).toContain("Score indicatif");
  expect(fr).toContain("Comparer la sélection");
  expect(fr).toContain("Courtier partenaire responsable");
  expect(fr).toContain("Demander un devis");
  expect(fr).toContain("Comparer les offres côte à côte");
  expect(fr).toContain("entre 2 et 4 offres");
  expect(fr).toContain("Détail de l'offre indicative");
  expect(fr).toContain("Exclusions principales");

  // The list, cards, compare and detail pages must actually read from the catalogue rather than hard-coding copy.
  expect(list).toContain('getTranslations("Offers")');
  expect(cards).toContain('useTranslations("OfferCards")');
  expect(compare).toContain('getTranslations("Compare")');
  expect(detail).toContain('getTranslations("OfferDetail")');
});

test("public comparator pages avoid regulated or recommendation wording", () => {
  const sources = readSources([
    publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx"),
    publicFile("components/offer-cards.tsx"),
    publicPage("compare/page.tsx"),
    publicPage("offers/[offerId]/page.tsx")
  ]);
  const catalogue = [messagesText("fr", "Offers"), messagesText("fr", "OfferCards"), messagesText("fr", "Compare"), messagesText("fr", "OfferDetail")].join("\n");
  const surface = `${sources}\n${catalogue}`.toLowerCase();

  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance", "nous vous recommandons"]) {
    expect(surface).not.toContain(forbidden.toLowerCase());
  }
  expect(catalogue).toContain("Sponsorisé");
  expect(catalogue.toLowerCase()).toContain("indicati");
});
