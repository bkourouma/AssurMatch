import type { ContentLocale, ContentSection } from "../types";

export const legalSlugs = ["legal-notice", "privacy", "cookies", "terms"] as const;
export type LegalSlug = (typeof legalSlugs)[number];

/** A country's replacement content for one section (matched by id) or an addition to a legal page. */
export interface CountryLegalSectionOverride {
  sections?: ContentSection[];
  placeholders?: string[];
}

/** Per-slug, per-locale overrides a country can provide on top of the global legal page. */
export type CountryLegalOverride = Partial<Record<LegalSlug, Partial<Record<ContentLocale, CountryLegalSectionOverride>>>>;
