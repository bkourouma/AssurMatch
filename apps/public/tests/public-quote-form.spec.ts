import { expect, test } from "@playwright/test";
import { messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";

test("public quote form includes validation, consent and disabled state", async () => {
  const component = readSources([publicFile("components/quote-form.tsx")]);
  const page = readSources([publicPage("countries/[countryCode]/products/[productKey]/quote/page.tsx")]);
  const api = readSources([publicFile("lib/public-api.ts")]);

  // Structural: field types, submit call, tracking token and API shape still live in the sources.
  expect(component).toContain('type="email"');
  expect(component).toContain('type="checkbox"');
  expect(component).toContain("submitPublicQuoteRequest");
  expect(component).toContain("publicReference");
  expect(component).toContain("QuoteBlockedState");
  expect(api).toContain("POST");
  expect(api).toContain("/quote-requests");
  expect(page).toContain("getPublicQuoteForm");

  // Copy: the page heading now lives in the French catalogue.
  const fr = messagesText("fr", "QuoteForm");
  expect(fr).toContain("Demander un devis");
});
