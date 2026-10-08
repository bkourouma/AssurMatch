import { expect, test } from "@playwright/test";
import { publicFile, publicPage, readSources } from "./helpers/public-sources";

const FORMS = [
  "components/forms/waitlist-form.tsx",
  "components/forms/contact-form.tsx",
  "components/forms/partner-application-form.tsx"
];

/**
 * Spec 047: the confirmation e-mail is written in the language of the page the submitter was
 * reading, so each of the three public forms sends that language with its submission.
 */
test("the three public forms send the page locale with their submission", () => {
  for (const form of FORMS) {
    const source = readSources([publicFile(form)]);

    // The locale comes from the layout's NextIntlClientProvider, narrowed by `toLocale`, and never
    // from the browser: a visitor reading the French site is answered in French whatever their
    // Accept-Language header says.
    expect(source, form).toContain("useLocale");
    expect(source, form).toContain("toLocale(useLocale())");
    expect(source, form).toContain("locale,");
    expect(source, form).not.toContain("navigator.language");
  }
});

/** The no-JavaScript server actions answer in the page language too, not in the default locale. */
test("the no-JavaScript server actions send the bound page locale", () => {
  const pages = [
    "contact/page.tsx",
    "brokers/apply/page.tsx",
    "countries/[countryCode]/page.tsx"
  ];
  for (const page of pages) {
    const source = readSources([publicPage(page)]);
    expect(source, page).toContain("locale: boundLocale,");
  }
});
