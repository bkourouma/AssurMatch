import { expect, test } from "@playwright/test";
import { messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";

function source(path: string): string {
  return readSources([path]);
}

test("public confirmation page offers optional token-bound document upload with scan states", () => {
  const api = source(publicFile("lib/public-api.ts"));
  const page = source(publicPage("quote-requests/[publicReference]/page.tsx"));
  const upload = source(publicFile("components/quote-document-upload.tsx"));
  const form = source(publicFile("components/quote-form.tsx"));

  // Structural: endpoints and the accepted file types are still in the sources.
  expect(api).toContain("uploadQuoteDocument");
  expect(api).toContain("listQuoteDocuments");
  expect(api).toContain("/documents");
  expect(upload).toContain('accept="application/pdf,image/jpeg,image/png"');

  // Copy: the visible labels and disclaimers now live in the French catalogue.
  const documentsCopy = messagesText("fr", "DocumentUpload");
  const quoteRequestCopy = messagesText("fr", "QuoteRequest");
  const quoteFormCopy = messagesText("fr", "QuoteForm");
  expect(quoteRequestCopy).toContain("Documents optionnels");
  expect(quoteRequestCopy).toContain("quarantaine");
  expect(quoteRequestCopy).toContain("aucune promesse de rappel");
  expect(documentsCopy).toContain("n'accélèrent ni ne garantissent aucune décision");
  expect(quoteFormCopy).toContain("ajouter des documents (optionnel)");

  // The page and form actually read from those namespaces.
  expect(page).toContain('getTranslations("QuoteRequest")');
  expect(form).toContain("trackLink");
});

test("document upload copy avoids regulated wording", () => {
  const files = [publicPage("quote-requests/[publicReference]/page.tsx"), publicFile("components/quote-document-upload.tsx")].map(source).join("\n");
  const catalogue = [messagesText("fr", "QuoteRequest"), messagesText("fr", "DocumentUpload")].join("\n");
  const surface = `${files}\n${catalogue}`;
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(surface).not.toContain(forbidden);
  }
});
