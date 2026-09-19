import { hasLocale } from "next-intl";
import { defineRouting } from "next-intl/routing";

/**
 * Single source of truth for the public visitor routing.
 *
 * Internal hrefs stay in English (they mirror the `app/[locale]` folder tree); the visitor-facing
 * URL is localised per locale. French is the default locale and is served without a prefix
 * (`/pays`), English is served under `/en` (`/en/countries`).
 *
 * Routes whose page does not exist yet are declared on purpose: declaring them here is harmless and
 * lets the pages land later without touching the routing.
 */
export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "as-needed",
  // Detection stays OFF: the URL alone decides the language. With it on, a visitor who once saw an
  // English page keeps a locale cookie that overrides an explicit French URL, so `/pays/...` would
  // render in English. It also kept the local health check and the browser smoke test, which sends
  // an English Accept-Language header, from landing on the French pages they assert.
  localeDetection: false,
  alternateLinks: false,
  pathnames: {
    "/": "/",
    "/countries": { fr: "/pays", en: "/countries" },
    "/countries/[countryCode]": { fr: "/pays/[countryCode]", en: "/countries/[countryCode]" },
    "/countries/[countryCode]/brokers": { fr: "/pays/[countryCode]/courtiers", en: "/countries/[countryCode]/brokers" },
    "/countries/[countryCode]/brokers/[partnerId]": {
      fr: "/pays/[countryCode]/courtiers/[partnerId]",
      en: "/countries/[countryCode]/brokers/[partnerId]"
    },
    "/countries/[countryCode]/insurers": { fr: "/pays/[countryCode]/assureurs", en: "/countries/[countryCode]/insurers" },
    "/countries/[countryCode]/products/[productKey]": {
      fr: "/pays/[countryCode]/produits/[productKey]",
      en: "/countries/[countryCode]/products/[productKey]"
    },
    "/countries/[countryCode]/products/[productKey]/offers": {
      fr: "/pays/[countryCode]/produits/[productKey]/offres",
      en: "/countries/[countryCode]/products/[productKey]/offers"
    },
    "/countries/[countryCode]/products/[productKey]/quote": {
      fr: "/pays/[countryCode]/produits/[productKey]/devis",
      en: "/countries/[countryCode]/products/[productKey]/quote"
    },
    "/countries/[countryCode]/legal-notice": {
      fr: "/pays/[countryCode]/mentions-legales",
      en: "/countries/[countryCode]/legal-notice"
    },
    "/countries/[countryCode]/privacy": {
      fr: "/pays/[countryCode]/confidentialite",
      en: "/countries/[countryCode]/privacy"
    },
    "/countries/[countryCode]/cookies": { fr: "/pays/[countryCode]/cookies", en: "/countries/[countryCode]/cookies" },
    "/countries/[countryCode]/terms": { fr: "/pays/[countryCode]/cgu", en: "/countries/[countryCode]/terms" },
    "/compare": { fr: "/comparer", en: "/compare" },
    "/offers/[offerId]": { fr: "/offres/[offerId]", en: "/offers/[offerId]" },
    "/quote-requests/[publicReference]": {
      fr: "/demandes-de-devis/[publicReference]",
      en: "/quote-requests/[publicReference]"
    },
    "/how-it-works": { fr: "/comment-ca-marche", en: "/how-it-works" },
    "/regulatory-status": { fr: "/statut-reglementaire", en: "/regulatory-status" },
    "/legal-notice": { fr: "/mentions-legales", en: "/legal-notice" },
    "/privacy": { fr: "/confidentialite", en: "/privacy" },
    "/cookies": "/cookies",
    "/terms": { fr: "/cgu", en: "/terms" },
    "/brokers": { fr: "/courtiers", en: "/brokers" },
    "/brokers/pricing": { fr: "/courtiers/tarifs", en: "/brokers/pricing" },
    "/brokers/apply": { fr: "/courtiers/candidature", en: "/brokers/apply" },
    "/brokers/login": { fr: "/courtiers/connexion", en: "/brokers/login" },
    "/contact": "/contact",
    "/guides": "/guides",
    "/guides/[slug]": "/guides/[slug]",
    "/faq": "/faq",
    "/glossary": { fr: "/lexique", en: "/glossary" }
  }
});

export type AppLocale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;

/** Narrows a raw route segment to a supported locale, falling back to the default one. */
export function toLocale(value: string): AppLocale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
