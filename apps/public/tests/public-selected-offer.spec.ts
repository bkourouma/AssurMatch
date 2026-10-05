import { expect, test } from "@playwright/test";
import { messagesJson, publicFile, publicLocales, publicPage, readSources } from "./helpers/public-sources";

/**
 * Spec 052 US4 (FR-016..FR-019): a quote request started from an offer names that offer's broker on
 * the form, and the confirmation says whether that broker received it or another partner broker did.
 */

const componentPath = publicFile("components/quote-form.tsx");
const apiPath = publicFile("lib/public-api.ts");
const pagePath = publicPage("countries/[countryCode]/products/[productKey]/quote/page.tsx");

function quoteFormMessages(locale: (typeof publicLocales)[number]): Record<string, unknown> {
  return messagesJson(locale).QuoteForm as Record<string, unknown>;
}

test("spec 052: the selected offer travels to the quote form read", async () => {
  const api = readSources([apiPath]);
  const page = readSources([pagePath]);

  expect(api).toContain("offerId?: string");
  expect(api).toContain('params.set("offerId", offerId)');
  expect(api).toContain("offerPartnerName?: string");
  expect(page).toContain("getPublicQuoteForm(countryCode, productKey, locale, selectedOfferId)");
  // Only a well-formed identifier is forwarded; the server stays the authority on the offer.
  expect(page).toContain("/^[0-9a-f-]{36}$/i.test(offerIdParam)");
});

test("spec 052: the offer's broker is named in the form header, the offer stays indicative", async () => {
  const component = readSources([componentPath]);
  expect(component).toContain("quoteForm.offerPartnerName");
  expect(component).toContain('t("offerPartner", { partner: offerPartnerName })');
  // Without a name served by the server the generic pre-selection notice remains.
  expect(component).toContain('t("preselected")');
  expect(component).toContain("<IndicativeOfferNotice />");

  expect(quoteFormMessages("fr").offerPartner).toBe(
    "Votre demande sera transmise à {partner}, courtier partenaire agréé, si sa disponibilité le permet. L'offre reste indicative : le courtier confirmera le devis et les conditions."
  );
  expect(String(quoteFormMessages("en").offerPartner)).toContain("{partner}, an approved partner broker");
});

test("spec 052: the confirmation follows selectedOfferPartnerRetained in three variants", async () => {
  const api = readSources([apiPath]);
  const component = readSources([componentPath]);

  expect(api).toContain("selectedOfferPartnerRetained?: boolean | null");
  expect(api).toContain('typeof body.selectedOfferPartnerRetained === "boolean" ? body.selectedOfferPartnerRetained : null');

  // true + known name: the offer's broker received the request.
  expect(component).toMatch(/result\.selectedOfferPartnerRetained === true && offerPartnerName\s*\?\s*t\("offerPartnerRetained", \{ partner: offerPartnerName \}\)/);
  // false with an offer: another approved partner broker.
  expect(component).toMatch(/selectedOfferId && result\.selectedOfferPartnerRetained === false\s*\?\s*t\("offerPartnerNotRetained"\)/);
  // null: the existing confirmation, nothing added.
  expect(component).toMatch(/t\("offerPartnerNotRetained"\)\s*:\s*null/);

  expect(quoteFormMessages("fr").offerPartnerRetained).toBe("Votre demande a été transmise à {partner}.");
  expect(quoteFormMessages("fr").offerPartnerNotRetained).toBe(
    "Le courtier de l'offre choisie n'était pas disponible : votre demande a été orientée vers un autre courtier partenaire agréé."
  );
  expect(quoteFormMessages("en").offerPartnerRetained).toBe("Your request has been sent to {partner}.");
  expect(String(quoteFormMessages("en").offerPartnerNotRetained)).toContain("another approved partner broker");
});

test("spec 052: the new copy exists in both locales and never promises a contract or a firm price", async () => {
  const keys = ["offerPartner", "offerPartnerRetained", "offerPartnerNotRetained"];
  const forbidden = /acheter maintenant|souscrire maintenant|contrat valide|garantie acceptée|la meilleure assurance du marché|buy now|subscribe now|valid contract|guaranteed price|prix ferme|firm price/i;
  for (const locale of publicLocales) {
    const messages = quoteFormMessages(locale);
    for (const key of keys) {
      expect(typeof messages[key], `${locale}.QuoteForm.${key}`).toBe("string");
      expect(String(messages[key])).not.toMatch(forbidden);
    }
    expect(String(messages.offerPartner)).toContain("{partner}");
    expect(String(messages.offerPartnerRetained)).toContain("{partner}");
  }
});

test("spec 052: the selected offer journey stays on the public surface", async () => {
  const sources = readSources([componentPath, apiPath, pagePath]);
  expect(sources).not.toMatch(/apps\/(admin|broker)/);
  expect(sources).not.toMatch(/from "[^"]*(admin|broker-backoffice|auth)[^"]*"/);
});
