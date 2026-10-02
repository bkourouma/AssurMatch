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

test("spec 050: the quote form is read and submitted in the page language, never another one", async () => {
  const component = readSources([publicFile("components/quote-form.tsx")]);
  const page = readSources([publicPage("countries/[countryCode]/products/[productKey]/quote/page.tsx")]);
  const api = readSources([publicFile("lib/public-api.ts")]);

  // The language travels on the read and on the submission.
  expect(api).toContain("new URLSearchParams({ language })");
  expect(api).toContain("/quote-form?${params.toString()}");
  expect(page).toContain("getPublicQuoteForm(countryCode, productKey, locale)");
  expect(component).toMatch(/formDefinitionId: quoteForm\.formDefinitionId,\s*language,/);

  // A form missing in this language is announced with links to the languages that exist.
  expect(api).toContain("QUOTE_FORM_LANGUAGE_UNAVAILABLE");
  expect(api).toContain("availableLanguages");
  expect(page).toContain('quoteForm.status === "language_unavailable"');
  expect(page).toContain("locale={language}");
  expect(page).toContain('from "../../../../../../../i18n/navigation"');

  const fr = messagesText("fr", "QuoteForm");
  const en = messagesText("en", "QuoteForm");
  expect(fr).toContain("Formulaire indisponible en français");
  expect(en).toContain("Form not available in English");
});

test("spec 050: the published consent text is shown as plain text and its hash echoed unchanged", async () => {
  const component = readSources([publicFile("components/quote-form.tsx")]);

  expect(component).toContain("quoteForm.consent.content");
  expect(component).toContain("{consentContent}");
  expect(component).toContain("contentHash: quoteForm.consent.contentHash");
  expect(component).not.toContain("dangerouslySetInnerHTML");
  // The static sentence is only a fallback for an API that does not serve the content.
  expect(component).toMatch(/consentContent \? \([\s\S]*\) : \([\s\S]*t\("consentLabel"\)/);
});

test("spec 050: the phone hint and pattern follow the country rule, the server stays the authority", async () => {
  const component = readSources([publicFile("components/quote-form.tsx")]);
  const api = readSources([publicFile("lib/public-api.ts")]);

  expect(component).toContain("quoteForm.phoneRule");
  expect(component).toContain('t("phoneRuleHint"');
  expect(component).toContain("pattern: phoneInputPattern");
  expect(api).toContain('"quotePhoneInvalid"');
  expect(api).toContain('"quoteConsentOutdated"');

  expect(messagesText("fr", "QuoteForm")).toContain("Format attendu : {dialCode} suivi de {lengths} chiffres");
  expect(messagesText("en", "QuoteForm")).toContain("Expected format: {dialCode} followed by {lengths} digits");
  expect(messagesText("fr", "Api")).toContain("format attendu pour ce pays");
});

test("spec 050: generic select options keep their codes and show localised labels", async () => {
  const component = readSources([publicFile("components/quote-form.tsx")]);

  expect(component).toContain("useMessages().QuoteForm?.options");
  expect(component).toContain("<option key={option} value={option}>");
  expect(messagesText("fr", "QuoteForm")).toContain("Bouche-à-oreille");
  expect(messagesText("en", "QuoteForm")).toContain("Word of mouth");
  expect(messagesText("fr", "QuoteForm")).toContain("Dans le mois");
  expect(messagesText("en", "QuoteForm")).toContain("Within a month");
});

test("spec 050: the public quote surface never imports back-office code or authentication", async () => {
  const sources = readSources([
    publicFile("components/quote-form.tsx"),
    publicFile("lib/public-api.ts"),
    publicPage("countries/[countryCode]/products/[productKey]/quote/page.tsx")
  ]);
  expect(sources).not.toMatch(/apps\/(admin|broker)/);
  expect(sources).not.toMatch(/from "[^"]*(admin|broker-backoffice|auth)[^"]*"/);
  expect(sources).not.toMatch(/authorization|bearer/i);
});
