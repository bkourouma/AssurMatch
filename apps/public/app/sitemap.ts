import type { MetadataRoute } from "next";
import { routing, type AppPathname } from "../i18n/routing";
import { listCountryDirectory, listPublicProducts } from "./lib/public-api";
import { localeUrl, type SeoParams } from "./lib/seo";

/**
 * Public sitemap (app-root metadata route, outside `[locale]` on purpose: Next serves a single
 * `/sitemap.xml` covering both locales, not one per locale).
 *
 * Only indexable, visitor-facing pages are listed: the quote journey, the tracking page, the
 * waiting-list variant of a country and `/aller` are excluded, matching `robots.ts`.
 *
 * The whole function is defensive: every catalogue read that fails or throws simply yields fewer
 * dynamic entries, and any unexpected error falls back to the static route list, because a failing
 * sitemap must never break the build.
 */

export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

interface StaticRoute {
  href: AppPathname;
  priority: number;
  changeFrequency: ChangeFrequency;
}

/** Routes that exist regardless of catalogue data, each declared once and emitted per locale. */
const STATIC_ROUTES: StaticRoute[] = [
  { href: "/", priority: 1, changeFrequency: "daily" },
  { href: "/countries", priority: 0.9, changeFrequency: "daily" },
  { href: "/how-it-works", priority: 0.5, changeFrequency: "monthly" },
  { href: "/regulatory-status", priority: 0.3, changeFrequency: "monthly" },
  { href: "/legal-notice", priority: 0.2, changeFrequency: "yearly" },
  { href: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { href: "/cookies", priority: 0.2, changeFrequency: "yearly" },
  { href: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { href: "/guides", priority: 0.6, changeFrequency: "weekly" },
  { href: "/glossary", priority: 0.4, changeFrequency: "monthly" },
  { href: "/faq", priority: 0.5, changeFrequency: "monthly" },
  { href: "/contact", priority: 0.4, changeFrequency: "monthly" },
  { href: "/brokers", priority: 0.5, changeFrequency: "monthly" },
  { href: "/brokers/pricing", priority: 0.5, changeFrequency: "monthly" },
  { href: "/brokers/apply", priority: 0.5, changeFrequency: "monthly" },
  { href: "/brokers/login", priority: 0.3, changeFrequency: "monthly" }
];

/** One sitemap entry per locale for a single route, each carrying every locale in `alternates`. */
function localizedEntries(
  href: AppPathname,
  params: SeoParams | undefined,
  priority: number,
  changeFrequency: ChangeFrequency
): MetadataRoute.Sitemap {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = localeUrl(locale, href, params);
  }
  return routing.locales.map((locale) => ({
    url: localeUrl(locale, href, params),
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages }
  }));
}

/**
 * Guide slugs. `app/content/guides` is owned by another agent working in parallel; it already
 * exports `guideSlugs()` at the time of writing, but the call still runs inside the caller's
 * try/catch and falls back to an empty list so a future shape change degrades the sitemap instead
 * of failing the build.
 */
async function readGuideSlugs(): Promise<string[]> {
  try {
    const guides = await import("./content/guides");
    return guides.guideSlugs();
  } catch {
    // TODO(content/guides): drop this fallback once the guides module (owned by another agent) has
    // landed for good; a missing module or export degrades the sitemap instead of failing the build.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.flatMap((route) =>
    localizedEntries(route.href, undefined, route.priority, route.changeFrequency)
  );

  try {
    const guideSlugsList = await readGuideSlugs();
    for (const slug of guideSlugsList) {
      entries.push(...localizedEntries("/guides/[slug]", { slug }, 0.6, "monthly"));
    }

    const directory = await listCountryDirectory();
    if (directory.status === "error") return entries;

    const activeCountries = directory.data.filter(
      (country) => country.availability === "open" || country.availability === "pilot"
    );

    for (const country of activeCountries) {
      const countryCode = country.isoCode;
      entries.push(...localizedEntries("/countries/[countryCode]", { countryCode }, 0.8, "daily"));
      entries.push(...localizedEntries("/countries/[countryCode]/brokers", { countryCode }, 0.6, "weekly"));
      entries.push(...localizedEntries("/countries/[countryCode]/insurers", { countryCode }, 0.6, "weekly"));

      const products = await listPublicProducts(countryCode);
      if (products.status === "error") continue;

      for (const product of products.data) {
        const productParams = { countryCode, productKey: product.key };
        entries.push(...localizedEntries("/countries/[countryCode]/products/[productKey]", productParams, 0.8, "daily"));
        entries.push(...localizedEntries("/countries/[countryCode]/products/[productKey]/offers", productParams, 0.9, "daily"));
      }
    }

    return entries;
  } catch {
    // A failing catalogue read must never break the build: the static routes still form a valid sitemap.
    return STATIC_ROUTES.flatMap((route) => localizedEntries(route.href, undefined, route.priority, route.changeFrequency));
  }
}
