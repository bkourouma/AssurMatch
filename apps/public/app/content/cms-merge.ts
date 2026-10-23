/**
 * Pure merge of the published CMS content (spec 072) on top of the static copy of the public site.
 *
 * Every function returns its static input untouched (same array / same object) when nothing is
 * published, so the rendering stays strictly identical to the static site. Content is plain text and
 * is only ever rendered as React text nodes.
 */

import type {
  ContentSectionDto,
  PublicContentFaqItem,
  PublicContentGlossaryEntry,
  PublicContentGuide,
  PublicContentLegalOverride
} from "../../../../packages/shared/contracts/content-cms.contracts";
import type { ContentSection, FaqItem, GlossaryEntry, Guide, LegalPage } from "./types";

/** Lower-case, accents stripped, every run of non letters/digits collapsed to one space. */
export function normalizeContentKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Keeps the last published item per normalized key, so a duplicated key never renders twice. */
function dedupeByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) byKey.set(keyOf(item), item);
  return [...byKey.values()];
}

export function mergeFaq(base: FaqItem[], published: readonly PublicContentFaqItem[]): FaqItem[] {
  if (published.length === 0) return base;
  const merged = [...base];
  for (const entry of dedupeByKey(published, (item) => normalizeContentKey(item.question))) {
    const key = normalizeContentKey(entry.question);
    const index = merged.findIndex((item) => normalizeContentKey(item.question) === key);
    if (index >= 0) {
      const current = merged[index]!;
      const theme = entry.theme ?? current.theme;
      const productKey = entry.productKey ?? current.productKey;
      merged[index] = { question: entry.question, answer: entry.answer, ...(theme ? { theme } : {}), ...(productKey ? { productKey } : {}) };
      continue;
    }
    const added: FaqItem = {
      question: entry.question,
      answer: entry.answer,
      ...(entry.theme ? { theme: entry.theme } : {}),
      ...(entry.productKey ? { productKey: entry.productKey } : {})
    };
    // At the end of its theme when the theme exists, otherwise at the end of the list.
    let insertAt = merged.length;
    if (entry.theme) {
      for (let i = merged.length - 1; i >= 0; i -= 1) {
        if (merged[i]!.theme === entry.theme) {
          insertAt = i + 1;
          break;
        }
      }
    }
    merged.splice(insertAt, 0, added);
  }
  return merged;
}

export function mergeGlossary(base: GlossaryEntry[], published: readonly PublicContentGlossaryEntry[]): GlossaryEntry[] {
  if (published.length === 0) return base;
  const merged = [...base];
  for (const entry of dedupeByKey(published, (item) => normalizeContentKey(item.term))) {
    const key = normalizeContentKey(entry.term);
    const next: GlossaryEntry = {
      term: entry.term,
      definition: entry.definition,
      ...(entry.seeAlso && entry.seeAlso.length > 0 ? { seeAlso: entry.seeAlso } : {})
    };
    const index = merged.findIndex((item) => normalizeContentKey(item.term) === key);
    if (index >= 0) merged[index] = next;
    else merged.push(next);
  }
  // Same order as the static glossary (alphabetical, French collation).
  return merged.sort((a, b) => a.term.localeCompare(b.term, "fr", { sensitivity: "base" }));
}

function toSection(section: ContentSectionDto): ContentSection {
  return {
    id: section.id,
    heading: section.heading,
    body: section.body,
    ...(section.bullets && section.bullets.length > 0 ? { bullets: section.bullets } : {})
  };
}

export function mergeGuides(base: Guide[], published: readonly PublicContentGuide[]): Guide[] {
  if (published.length === 0) return base;
  const merged = [...base];
  for (const entry of dedupeByKey(published, (item) => item.slug)) {
    const next: Guide = {
      slug: entry.slug,
      title: entry.title,
      description: entry.description,
      updatedAt: entry.updatedAt,
      sections: entry.sections.map(toSection),
      keyPoints: entry.keyPoints,
      mistakes: entry.mistakes,
      ...(entry.productKey ? { productKey: entry.productKey } : {}),
      ...(entry.compareCta ? { compareCta: entry.compareCta } : {})
    };
    const index = merged.findIndex((guide) => guide.slug === entry.slug);
    if (index >= 0) merged[index] = next;
    else merged.push(next);
  }
  return merged;
}

/** Same semantics as `mergeSections` in content/legal/index.ts: replace by id, append unknown ids. */
export function mergeLegalSections(base: readonly ContentSection[], overrides: readonly ContentSection[]): ContentSection[] {
  const merged = base.map((section) => overrides.find((override) => override.id === section.id) ?? section);
  for (const override of overrides) {
    if (!base.some((section) => section.id === override.id)) merged.push(override);
  }
  return merged;
}

/**
 * Applies a published per-country override on a legal page already resolved from the static copy
 * (global page + static country override). Sections merge by id; the CMS placeholders, when the
 * override states them, replace the static list (an empty list clears it); title, description and
 * summary replace the static ones when provided; `updatedAt` is the publication date.
 */
export function mergeLegalPage(base: LegalPage, override?: PublicContentLegalOverride): LegalPage {
  if (!override) return base;
  const placeholders = override.placeholders !== undefined ? override.placeholders : base.placeholders;
  const summary = override.summary && override.summary.length > 0 ? override.summary : base.summary;
  return {
    slug: base.slug,
    title: override.title ?? base.title,
    description: override.description ?? base.description,
    updatedAt: override.updatedAt,
    sections: mergeLegalSections(base.sections, override.sections.map(toSection)),
    ...(placeholders && placeholders.length > 0 ? { placeholders: [...placeholders] } : {}),
    ...(summary ? { summary } : {})
  };
}
