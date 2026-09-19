// Imported from the metadata module rather than the package root: the root declaration also
// augments NodeJS.ProcessEnv globally, which leaks Next-only typing into the backend programme of
// the shared tsconfig.
import type { Metadata } from "next/dist/lib/metadata/types/metadata-interface";
import { getPathname } from "../../i18n/navigation";
import { routing, type AppLocale, type AppPathname } from "../../i18n/routing";
import { siteUrl } from "./site-config";

export type PageMetadata = Metadata;

export type SeoParams = Record<string, string | string[]>;

type PathnameArg = AppPathname | { pathname: AppPathname; params: SeoParams };

/**
 * `getPathname` is typed per route so that each route only accepts its own params. Metadata is
 * generated from values already validated by the page, so the call is widened once, here.
 */
const resolvePathname = getPathname as unknown as (args: { locale: AppLocale; href: PathnameArg }) => string;

export function localePath(locale: AppLocale, href: AppPathname, params?: SeoParams): string {
  return resolvePathname({ locale, href: params ? { pathname: href, params } : href });
}

export function localeUrl(locale: AppLocale, href: AppPathname, params?: SeoParams): string {
  return new URL(localePath(locale, href, params), siteUrl).toString();
}

export interface BuildMetadataInput {
  title: string;
  description: string;
  href: AppPathname;
  locale: AppLocale;
  params?: SeoParams;
  noindex?: boolean;
}

/**
 * Canonical + hreflang for one public page. `x-default` points at the French URL, which is the
 * unprefixed default locale.
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const { title, description, href, locale, params, noindex } = input;
  const canonical = localeUrl(locale, href, params);
  const languages: Record<string, string> = {};
  for (const candidate of routing.locales) {
    languages[candidate] = localeUrl(candidate, href, params);
  }
  languages["x-default"] = localeUrl(routing.defaultLocale, href, params);

  // "AssurMatch | AssurMatch" would be the result on the pages whose title is the brand itself.
  const absolute = title === "AssurMatch" || title.endsWith(" | AssurMatch") ? title : `${title} | AssurMatch`;

  return {
    metadataBase: new URL(siteUrl),
    title: { absolute, template: "%s | AssurMatch", default: title },
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: "website",
      siteName: "AssurMatch",
      locale: locale === "fr" ? "fr_FR" : "en_GB",
      title,
      description,
      url: canonical
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {})
  };
}

/* ---------- JSON-LD builders ---------- */

export type JsonLd = Record<string, unknown>;

export function organizationJsonLd(locale: AppLocale): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AssurMatch",
    url: localeUrl(locale, "/"),
    logo: new URL("/logo-assurmatch.png", siteUrl).toString(),
    description:
      locale === "fr"
        ? "Plateforme technique de comparaison indicative d'offres d'assurance et de mise en relation avec des courtiers partenaires autorises."
        : "Technical platform for indicative insurance offer comparison and introduction to authorised partner brokers."
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqJsonLd(items: readonly FaqItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
}

export interface OfferJsonLdInput {
  name: string;
  description?: string;
  url: string;
  price?: number;
  currency?: string;
  sellerName?: string;
  validUntil?: string;
}

export function offerJsonLd(input: OfferJsonLdInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.price !== undefined ? { price: input.price, priceCurrency: input.currency ?? "XOF" } : {}),
    ...(input.validUntil ? { priceValidUntil: input.validUntil.slice(0, 10) } : {}),
    ...(input.sellerName ? { seller: { "@type": "Organization", name: input.sellerName } } : {}),
    availability: "https://schema.org/InStock",
    category: "Insurance"
  };
}

export interface LocalBusinessJsonLdInput {
  name: string;
  url: string;
  city?: string;
  countryIso?: string;
  telephone?: string;
  licenceNumber?: string;
}

export function localBusinessJsonLd(input: LocalBusinessJsonLdInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "InsuranceAgency",
    name: input.name,
    url: input.url,
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.licenceNumber ? { identifier: input.licenceNumber } : {}),
    ...(input.city || input.countryIso
      ? {
          address: {
            "@type": "PostalAddress",
            ...(input.city ? { addressLocality: input.city } : {}),
            ...(input.countryIso ? { addressCountry: input.countryIso } : {})
          }
        }
      : {})
  };
}
