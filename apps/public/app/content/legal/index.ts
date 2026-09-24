/**
 * Legal content seam.
 *
 * `getLegalPage` is the single read path every legal page (global and per-country) goes through. It
 * currently resolves a `LegalPage` from the static TypeScript records in this folder and merges an
 * optional per-country override on top, section by section (matched by `ContentSection.id`). A future
 * CMS integration only has to replace the body of this function (and the module it reads from) —
 * the `LegalPage` / `ContentSection` shape, the merge semantics, and every page that calls
 * `getLegalPage` stay exactly the same.
 */

import type { ContentLocale, ContentSection, LegalPage } from "../types";
import { legalNoticeContent } from "./legal-notice";
import { privacyContent } from "./privacy";
import { cookiesContent } from "./cookies";
import { termsContent } from "./terms";
import { countryLegalOverrides } from "./countries";
import { legalSlugs, type LegalSlug } from "./shared-types";

export { legalSlugs, type LegalSlug };

const registry: Record<LegalSlug, Record<ContentLocale, LegalPage>> = {
  "legal-notice": legalNoticeContent,
  privacy: privacyContent,
  cookies: cookiesContent,
  terms: termsContent
};

function isLegalSlug(value: string): value is LegalSlug {
  return (legalSlugs as readonly string[]).includes(value);
}

/** Replaces a section with the same id, or appends it when the base page does not have that id yet. */
function mergeSections(base: readonly ContentSection[], overrides: readonly ContentSection[]): ContentSection[] {
  const merged = base.map((section) => overrides.find((override) => override.id === section.id) ?? section);
  for (const override of overrides) {
    if (!base.some((section) => section.id === override.id)) merged.push(override);
  }
  return merged;
}

/**
 * Resolves one legal page for a locale, optionally scoped to a country. Returns `null` only when
 * `slug` is not one of `legalSlugs` — an unknown or unopened country never 404s, it silently falls
 * back to the global page.
 */
export function getLegalPage(slug: string, locale: ContentLocale, countryCode?: string): LegalPage | null {
  if (!isLegalSlug(slug)) return null;
  const base = registry[slug][locale];

  const countryOverride = countryCode ? countryLegalOverrides[countryCode.toUpperCase()]?.[slug]?.[locale] : undefined;
  if (!countryOverride) return base;

  const placeholders = Array.from(new Set([...(base.placeholders ?? []), ...(countryOverride.placeholders ?? [])]));

  return {
    ...base,
    sections: mergeSections(base.sections, countryOverride.sections ?? []),
    ...(placeholders.length > 0 ? { placeholders } : {})
  };
}

/** Whether a country provides a specific override for this legal page, used to word the country notice. */
export function hasCountryLegalOverride(slug: string, countryCode: string): boolean {
  if (!isLegalSlug(slug)) return false;
  return Boolean(countryLegalOverrides[countryCode.toUpperCase()]?.[slug]);
}
