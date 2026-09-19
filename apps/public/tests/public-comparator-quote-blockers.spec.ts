import { expect, test } from "@playwright/test";
import { messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";

test("public comparator blocker states are visible in source and catalogue", async () => {
  // Structural: each blocked state is still wired through its own translation namespace in the page/component source.
  const product = readSources([publicPage("countries/[countryCode]/products/[productKey]/page.tsx")]);
  const form = readSources([publicFile("components/quote-form.tsx")]);
  const confirmation = readSources([publicPage("quote-requests/[publicReference]/page.tsx")]);

  expect(product).toContain('getTranslations("Product")');
  expect(form).toContain("QuoteBlockedState");
  expect(confirmation).toContain('getTranslations("QuoteRequest")');

  // Copy: the blocker sentences themselves now live in the French catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("non validées");
  expect(fr).toContain("La demande de devis n'est pas disponible pour ce pays ou ce produit.");
  expect(fr).toContain("aucun courtier partenaire éligible n'est disponible");
});
