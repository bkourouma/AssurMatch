/**
 * Content model for the institutional, legal, guides, glossary and FAQ copy of the public site.
 *
 * Every type here is deliberately plain data (no JSX, no translation hooks) so it can later be
 * swapped for a CMS-backed source without touching the pages that render it. See
 * `app/content/legal/index.ts` for the seam where that swap would happen first.
 */

export type ContentLocale = "fr" | "en";

/** One block of a long-form page: a heading, one or more paragraphs, and optional bullet points. */
export interface ContentSection {
  /** Stable id, used as an in-page anchor (for example "remuneration"). */
  id: string;
  heading: string;
  body: string[];
  bullets?: string[];
}

/** A legal page (mentions légales, confidentialité, cookies, CGU). */
export interface LegalPage {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) shown as "dernière mise à jour". */
  updatedAt: string;
  sections: ContentSection[];
  /**
   * Human-readable labels of the legal identifiers this page cannot state yet (registration
   * number, address, publication director, hosting provider, DPO, supervisory authority...).
   * Rendered visibly on the page via `LegalPlaceholder`, never silently omitted.
   */
  placeholders?: string[];
  /**
   * "L'essentiel en 5 lignes": a short plain-language summary shown in a `Notice` right under the
   * page's last-updated meta line, before the table of contents. Optional so a future legal page can
   * be added without one; every page in this spec provides five lines.
   */
  summary?: string[];
}

/** A practical guide (auto insurance, travel insurance, reading an indicative price, ...). */
export interface Guide {
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  /** Product this guide relates to, used to embed the matching EntrySelector. */
  productKey?: string;
  sections: ContentSection[];
  /** 3 to 5 short bullets, "Points clés". Reading time is derived from `sections`, never typed. */
  keyPoints: string[];
  /** 3 to 5 short bullets, "Erreurs à éviter", phrased in the infinitive. */
  mistakes: string[];
  /** Targeted lead for the bottom "Comparer les offres" block; falls back to the generic lead. */
  compareCta?: string;
}

/** One glossary term. */
export interface GlossaryEntry {
  term: string;
  definition: string;
  /** Related terms, referenced by their exact `term` value. */
  seeAlso?: string[];
}

/** One FAQ question/answer pair. */
export interface FaqItem {
  question: string;
  answer: string;
  /** Product this question relates to, used to embed the matching EntrySelector. */
  productKey?: string;
  /** Editorial theme used to group the FAQ page ("Le service", "Les offres et le score", ...). */
  theme?: string;
}
