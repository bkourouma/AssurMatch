/**
 * Content resolvers: static copy first (the default and the fallback), then the published CMS
 * content merged on top (spec 072). Pages call these instead of the static modules directly. When
 * nothing is published, or the API is unavailable, the result equals the static content.
 */

import { fetchPublicContent } from "../lib/content-cms";
import { mergeFaq, mergeGlossary, mergeGuides, mergeLegalPage } from "./cms-merge";
import { listFaq } from "./faq";
import { listGlossary } from "./glossary";
import { getGuide, listGuides } from "./guides";
import { getLegalPage, hasCountryLegalOverride, legalSlugs, type LegalSlug } from "./legal";
import type { ContentLocale, FaqItem, GlossaryEntry, Guide, LegalPage } from "./types";

export async function resolveFaq(locale: ContentLocale): Promise<FaqItem[]> {
  const published = await fetchPublicContent(locale);
  return mergeFaq(listFaq(locale), published.faq);
}

export async function resolveGlossary(locale: ContentLocale): Promise<GlossaryEntry[]> {
  const published = await fetchPublicContent(locale);
  return mergeGlossary(listGlossary(locale), published.glossary);
}

export async function resolveGuides(locale: ContentLocale): Promise<Guide[]> {
  const published = await fetchPublicContent(locale);
  return mergeGuides(listGuides(locale), published.guides);
}

/** One guide by slug (static or published), or null when neither source has it. */
export async function resolveGuide(locale: ContentLocale, slug: string): Promise<Guide | null> {
  const published = await fetchPublicContent(locale);
  if (published.guides.length === 0) return getGuide(locale, slug);
  return mergeGuides(listGuides(locale), published.guides).find((guide) => guide.slug === slug) ?? null;
}

export interface ResolvedLegalPage {
  page: LegalPage;
  /** True when the country has a static or a published override for this page (drives the country notice). */
  hasOverride: boolean;
}

function isLegalSlug(value: string): value is LegalSlug {
  return (legalSlugs as readonly string[]).includes(value);
}

/** A legal page with its override state; null only when `slug` is not a legal slug. */
export async function resolveLegalPageWithOverride(slug: string, locale: ContentLocale, countryCode?: string): Promise<ResolvedLegalPage | null> {
  const base = getLegalPage(slug, locale, countryCode);
  if (!base || !isLegalSlug(slug)) return null;
  if (!countryCode) return { page: base, hasOverride: false };
  const staticOverride = hasCountryLegalOverride(slug, countryCode);
  const published = await fetchPublicContent(locale, countryCode.toUpperCase());
  const override = published.legal[slug];
  return { page: mergeLegalPage(base, override), hasOverride: staticOverride || Boolean(override) };
}

export async function resolveLegalPage(slug: string, locale: ContentLocale, countryCode?: string): Promise<LegalPage | null> {
  return (await resolveLegalPageWithOverride(slug, locale, countryCode))?.page ?? null;
}
