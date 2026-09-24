import { expect, test } from "@playwright/test";
import { messagesText, publicPage, readSources } from "./helpers/public-sources";

test("public quote confirmation remains visitor-safe", async () => {
  const source = readSources([publicPage("quote-requests/[publicReference]/page.tsx")]);

  // Structural: the indicative-price notice component is still wired into the confirmation page.
  expect(source).toContain("IndicativeOfferNotice");
  expect(source).toContain('getTranslations("QuoteRequest")');

  // Copy: the confirmation heading and the "no promise of a callback" wording now live in the catalogue.
  const fr = messagesText("fr");
  expect(fr).toContain("Demande reçue");
  expect(fr).toContain("aucune promesse de rappel");
});
