import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { publicFile, readSources } from "./helpers/public-sources";

test("the locale layout loads the fonts and renders the skip link, header and footer", () => {
  const layout = readSources([publicFile("[locale]/layout.tsx")]);

  expect(layout).toContain('from "../fonts"');
  expect(layout).toContain("headingFont.variable");
  expect(layout).toContain("bodyFont.variable");
  expect(layout).toContain("<SkipLink");
  expect(layout).toContain("<SiteHeader");
  expect(layout).toContain("<SiteFooter");
});

test("the header carries the comparison call to action and a language switcher", () => {
  const header = readSources([publicFile("components/site/site-header.tsx")]);

  expect(header).toContain('href="/compare"');
  expect(header).toContain("am-header__cta");
  expect(header).toContain("<LanguageSwitcher");
});

test("the footer links to the regulatory status page, the four legal pages, the broker pages and contact", () => {
  const footer = readSources([publicFile("components/site/site-footer.tsx")]);

  expect(footer).toContain('href="/regulatory-status"');
  expect(footer).toContain('href="/legal-notice"');
  expect(footer).toContain('href="/privacy"');
  expect(footer).toContain('href="/cookies"');
  expect(footer).toContain('href="/terms"');
  expect(footer).toContain('href="/brokers/apply"');
  expect(footer).toContain('href="/brokers/pricing"');
  expect(footer).toContain("brokerLoginUrl");
  expect(footer).toContain('href="/contact"');
});

test("next.config.ts declares every legacy redirect from the pre-bilingual site", () => {
  const config = readFileSync("apps/public/next.config.ts", "utf8");

  const redirects: Array<[string, string]> = [
    ["/catalog", "/pays"],
    ["/countries", "/pays"],
    ["/countries/:countryCode", "/pays/:countryCode"],
    ["/countries/:countryCode/products/:productKey", "/pays/:countryCode/produits/:productKey"],
    ["/countries/:countryCode/products/:productKey/offers", "/pays/:countryCode/produits/:productKey/offres"],
    ["/countries/:countryCode/products/:productKey/quote", "/pays/:countryCode/produits/:productKey/devis"],
    ["/compare", "/comparer"],
    ["/offers/:offerId", "/offres/:offerId"],
    ["/quote-requests/:publicReference", "/demandes-de-devis/:publicReference"]
  ];

  for (const [source, destination] of redirects) {
    expect(config).toContain(`"${source}"`);
    expect(config).toContain(`"${destination}"`);
  }
  expect(config).toContain("async redirects()");
});
