import { expect, test } from "@playwright/test";
import { messagesJson, publicFile, publicLocales, publicPage, readSource, type PublicLocale } from "./helpers/public-sources";

type VisitorAiCatalogue = {
  modes: Record<string, { title: string; button: string; aiNotice: string }>;
  fieldHelp: Record<string, string>;
};

function catalogue(locale: PublicLocale): VisitorAiCatalogue {
  return messagesJson(locale).VisitorAi as VisitorAiCatalogue;
}

const component = () => readSource(publicFile("components/visitor-ai-assistant.tsx"));

test("the assistant maps the guarantee and compare modes to their assist types and request bodies", () => {
  const source = component();
  expect(source).toContain('guarantees: { assistType: "visitor_guarantee_explainer", hasInput: false }');
  expect(source).toContain('compare: { assistType: "visitor_compare_explainer", hasInput: false }');
  expect(source).toContain("body.offerId = offerId");
  expect(source).toContain("body.offerIds = offerIds");
  // The current locale is sent for every mode.
  expect(source).toContain("useLocale");
  expect(source).toMatch(/language: locale/);
});

test("the offer explainers need their context and stay invisible until availability is confirmed", () => {
  const source = component();
  expect(source).toContain("if (contextMissing) return null");
  expect(source).toContain("if (available !== true) return null");
  expect(source).toContain("readVisitorAiAvailability");
  expect(source).toMatch(/!productKey/);
  expect(source).toMatch(/offerIds\.length >= 2 && offerIds\.length <= 4/);
  // Never blocking: nothing here disables or hides the quote journey, and nothing is applied automatically.
  expect(source).not.toContain("onApply");
});

test("the offer detail page mounts the guarantees explainer with the offer id", () => {
  const page = readSource(publicPage("offers/[offerId]/page.tsx"));
  expect(page).toContain('mode="guarantees"');
  expect(page).toContain("offerId={offerId}");
  expect(page).toMatch(/countryCode && productKey \? <VisitorAiAssistant/);
});

test("the comparison page mounts the compare explainer for a valid selection only", () => {
  const page = readSource(publicPage("compare/page.tsx"));
  expect(page).toContain('mode="compare"');
  expect(page).toContain("offerIds={ids}");
  expect(page).toContain("findOfferContext(ids[0])");
  expect(page).toMatch(/selectionValid && assistCountry && assistProduct/);
  expect(page).toContain("selectionValid && ids[0] && !(countryCode && productKey) ? await findOfferContext");
});

for (const locale of publicLocales) {
  test(`the permanent AI notice and neutral wording are present in ${locale}`, () => {
    const visitorAi = catalogue(locale);
    const expected = locale === "fr" ? "Contenu généré par IA, à confirmer par le courtier partenaire." : "AI-generated content, to be confirmed by the partner broker.";
    expect(visitorAi.modes.guarantees?.aiNotice).toBe(expected);
    expect(visitorAi.modes.compare?.aiNotice).toBe(expected);
    expect(visitorAi.fieldHelp.aiNotice).toBe(expected);
    for (const key of ["trigger", "title", "close", "note", "aiNotice"]) expect(visitorAi.fieldHelp[key]).toBeTruthy();

    const added = JSON.stringify([visitorAi.modes.guarantees, visitorAi.modes.compare, visitorAi.fieldHelp]).toLowerCase();
    const forbidden =
      locale === "fr"
        ? ["acheter", "souscri", "meilleur", "recommand", "conseill"]
        : ["buy", "subscribe", "best", "recommend", "advise", "advice"];
    for (const word of forbidden) expect(added).not.toContain(word);
  });
}

test("the French offer explainer titles use the agreed wording", () => {
  const fr = catalogue("fr");
  expect(fr.modes.guarantees?.button).toBe("Expliquer les garanties");
  expect(fr.modes.compare?.button).toBe("Expliquer les différences");
});
