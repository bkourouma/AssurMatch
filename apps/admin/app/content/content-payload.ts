/**
 * Spec 072: conversion between the plain text fields of the content forms and the JSON payload of
 * each content kind. Pure module (no "use server", no React): the server actions parse the form
 * data with it and the edit form uses the reverse conversion to prefill its fields.
 *
 * Field names are prefixed by the kind (`faq_question`, `guide_sections`, ...). Sections are typed
 * as blocks of lines, so no character inside a text is ever a separator:
 *
 *   # identifiant           starts a section
 *   Titre de la section     first line after it: the heading
 *   Un paragraphe par ligne (any character allowed, | and ‖ included)
 *   - une puce par ligne, préfixée par « - »
 *
 * A heading or paragraph that itself starts with `#`, `-` or a backslash is typed with a leading
 * backslash (`\- 10 % de remise`); `formatSections` adds it. The API validates the payload; this
 * module only rejects what it cannot read.
 */
import type { ContentKind } from "../../../../packages/shared/contracts/content-cms.contracts";

export const SECTION_MARKER = "#";
export const BULLET_MARKER = "-";
export const ESCAPE_MARKER = "\\";

/** Help text shown under the sections fields. */
export const SECTIONS_HELP = "Une section commence par une ligne « # identifiant », suivie d'une ligne de titre, puis d'un paragraphe par ligne ; une puce par ligne, préfixée par « - ». Une ligne de texte qui commence par #, - ou \\ s'écrit précédée de \\. Une ligne vide sépare les sections.";

/** Example typed in an empty sections field (placeholder). */
export function sectionsExample(id: string, heading: string): string {
  return [`${SECTION_MARKER} ${id}`, heading, "Premier paragraphe.", "Second paragraphe.", `${BULLET_MARKER} Une puce`].join("\n");
}

export type FormValues = Record<string, string>;

function text(source: (name: string) => string, name: string): string {
  return source(name).trim();
}

function optional(source: (name: string) => string, name: string): string | undefined {
  const value = text(source, name);
  return value ? value : undefined;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export interface ParsedSection {
  id: string;
  heading: string;
  body: string[];
  bullets?: string[];
}

/** Removes the leading escape of a heading or paragraph line. */
function unescapeLine(line: string): string {
  return line.startsWith(ESCAPE_MARKER) ? line.slice(ESCAPE_MARKER.length) : line;
}

/** Escapes a heading or paragraph whose first character would otherwise read as a marker. */
function escapeLine(text: string): string {
  const value = text.trim();
  return value.startsWith(SECTION_MARKER) || value.startsWith(BULLET_MARKER) || value.startsWith(ESCAPE_MARKER) ? `${ESCAPE_MARKER}${value}` : value;
}

/** A single line: inner line breaks of a heading or a bullet become spaces (one line per item). */
function oneLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " ").trim();
}

const SECTION_FORMAT_HINT = "« # identifiant », puis une ligne de titre, puis un paragraphe par ligne";

export function parseSections(value: string): ParsedSection[] {
  const sections: Array<{ id: string; heading?: string; body: string[]; bullets: string[] }> = [];
  value.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith(SECTION_MARKER)) {
      sections.push({ id: line.slice(SECTION_MARKER.length).trim(), body: [], bullets: [] });
      return;
    }
    const current = sections.at(-1);
    if (!current) throw new Error(`form_Ligne ${index + 1} : une section commence par une ligne ${SECTION_FORMAT_HINT}.`);
    if (current.heading === undefined) {
      current.heading = unescapeLine(line).trim();
      return;
    }
    if (line.startsWith(BULLET_MARKER)) {
      const bullet = line.slice(BULLET_MARKER.length).trim();
      if (bullet) current.bullets.push(bullet);
      return;
    }
    const paragraph = unescapeLine(line).trim();
    if (paragraph) current.body.push(paragraph);
  });
  return sections.map((section, index) => {
    if (!section.id || !section.heading || section.body.length === 0) {
      throw new Error(`form_Section ${index + 1} invalide : utilisez ${SECTION_FORMAT_HINT} (au moins un).`);
    }
    return { id: section.id, heading: section.heading, body: section.body, ...(section.bullets.length > 0 ? { bullets: section.bullets } : {}) };
  });
}

/** Reverse of `parseSections`: `parseSections(formatSections(x))` gives `x` back for single-line texts. */
export function formatSections(sections: unknown): string {
  if (!Array.isArray(sections)) return "";
  return sections
    .map((section) => {
      const s = (section ?? {}) as { id?: unknown; heading?: unknown; body?: unknown; bullets?: unknown };
      const body = Array.isArray(s.body) ? s.body.flatMap((paragraph) => String(paragraph).split(/\r?\n/)).map((line) => line.trim()).filter(Boolean).map(escapeLine) : [];
      const bullets = Array.isArray(s.bullets) ? s.bullets.map((bullet) => oneLine(String(bullet))).filter(Boolean).map((bullet) => `${BULLET_MARKER} ${bullet}`) : [];
      return [`${SECTION_MARKER} ${oneLine(String(s.id ?? ""))}`, escapeLine(oneLine(String(s.heading ?? ""))), ...body, ...bullets].join("\n");
    })
    .join("\n\n");
}

function list(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Builds the payload of `kind` from the form fields read through `get` (empty string when absent). */
export function payloadFromFields(kind: ContentKind, get: (name: string) => string): Record<string, unknown> {
  switch (kind) {
    case "faq": {
      const theme = optional(get, "faq_theme");
      const productKey = optional(get, "faq_productKey");
      return {
        question: text(get, "faq_question"),
        answer: text(get, "faq_answer"),
        ...(theme ? { theme } : {}),
        ...(productKey ? { productKey } : {})
      };
    }
    case "guide": {
      const productKey = optional(get, "guide_productKey");
      const compareCta = optional(get, "guide_compareCta");
      return {
        title: text(get, "guide_title"),
        description: text(get, "guide_description"),
        ...(productKey ? { productKey } : {}),
        sections: parseSections(get("guide_sections")),
        keyPoints: lines(get("guide_keyPoints")),
        mistakes: lines(get("guide_mistakes")),
        ...(compareCta ? { compareCta } : {})
      };
    }
    case "glossary": {
      const seeAlso = lines(get("glossary_seeAlso"));
      return {
        term: text(get, "glossary_term"),
        definition: text(get, "glossary_definition"),
        ...(seeAlso.length > 0 ? { seeAlso } : {})
      };
    }
    case "legal_override": {
      const title = optional(get, "legal_title");
      const description = optional(get, "legal_description");
      const summary = lines(get("legal_summary"));
      const placeholders = lines(get("legal_placeholders"));
      return {
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(summary.length > 0 ? { summary } : {}),
        sections: parseSections(get("legal_sections")),
        ...(placeholders.length > 0 ? { placeholders } : {})
      };
    }
  }
}

export function payloadFromFormData(kind: ContentKind, formData: FormData): Record<string, unknown> {
  return payloadFromFields(kind, (name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  });
}

/** Reverse conversion: prefill values for the edit form. */
export function fieldsFromPayload(kind: ContentKind, payload: Record<string, unknown>): FormValues {
  switch (kind) {
    case "faq":
      return {
        faq_question: str(payload.question),
        faq_answer: str(payload.answer),
        faq_theme: str(payload.theme),
        faq_productKey: str(payload.productKey)
      };
    case "guide":
      return {
        guide_title: str(payload.title),
        guide_description: str(payload.description),
        guide_productKey: str(payload.productKey),
        guide_sections: formatSections(payload.sections),
        guide_keyPoints: list(payload.keyPoints),
        guide_mistakes: list(payload.mistakes),
        guide_compareCta: str(payload.compareCta)
      };
    case "glossary":
      return {
        glossary_term: str(payload.term),
        glossary_definition: str(payload.definition),
        glossary_seeAlso: list(payload.seeAlso)
      };
    case "legal_override":
      return {
        legal_title: str(payload.title),
        legal_description: str(payload.description),
        legal_summary: list(payload.summary),
        legal_sections: formatSections(payload.sections),
        legal_placeholders: list(payload.placeholders)
      };
  }
}

/** Derives the machine key of a new faq/guide/glossary entry from its title when none is typed. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
