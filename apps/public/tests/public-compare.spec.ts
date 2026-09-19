import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("public comparator exposes criteria filters, explainable score and side-by-side comparison", () => {
  const api = source("apps/public/app/lib/public-api.ts");
  const list = source("apps/public/app/countries/[countryCode]/products/[productKey]/offers/page.tsx");
  const cards = source("apps/public/app/components/offer-cards.tsx");
  const compare = source("apps/public/app/compare/page.tsx");
  const detail = source("apps/public/app/offers/[offerId]/page.tsx");
  const quote = source("apps/public/app/countries/[countryCode]/products/[productKey]/quote/page.tsx");

  expect(api).toContain("/offers/compare");
  expect(api).toContain("minGuaranteeLevel");
  expect(list).toContain("Niveau de garantie minimum");
  expect(list).toContain("Franchise maximale");
  expect(list).toContain("Score indicatif");
  expect(list).toContain("Comparer la selection");
  expect(cards).toContain("Courtier partenaire responsable");
  expect(cards).toContain("Score indicatif");
  expect(cards).toContain("Demander un devis");
  expect(compare).toContain("Comparer les offres cote a cote");
  expect(compare).toContain("entre 2 et 4 offres");
  expect(detail).toContain("Detail de l'offre indicative");
  expect(detail).toContain("Exclusions principales");
  expect(quote).toContain("selectedOfferId");
});

test("public comparator pages avoid regulated or recommendation wording", () => {
  const files = [
    "apps/public/app/countries/[countryCode]/products/[productKey]/offers/page.tsx",
    "apps/public/app/components/offer-cards.tsx",
    "apps/public/app/compare/page.tsx",
    "apps/public/app/offers/[offerId]/page.tsx"
  ].map(source).join("\n");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance", "nous vous recommandons"]) {
    expect(files.toLowerCase()).not.toContain(forbidden.toLowerCase());
  }
  expect(files).toContain("Sponsorise");
  expect(files).toContain("indicati");
});
