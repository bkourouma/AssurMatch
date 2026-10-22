/**
 * Spec 072: conversion between the plain text fields of the content forms and the JSON payload of
 * each content kind. Pure module (no "use server", no React): the server actions parse the form
 * data with it and the edit form uses the reverse conversion to prefill its fields.
 *
 * Field names are prefixed by the kind (`faq_question`, `guide_sections`, ...). Sections are typed
 * one per line as `id|titre|paragraphe 1 ‖ paragraphe 2` with an optional fourth segment of bullets
 * separated the same way. The API validates the payload; this module only rejects what it cannot read.
 */
import type { ContentKind } from "../../../../packages/shared/contracts/content-cms.contracts";

export const SECTION_SEPARATOR = "‖";

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

function parts(value: string): string[] {
  return value.split(SECTION_SEPARATOR).map((part) => part.trim()).filter(Boolean);
}

export function parseSections(value: string): Array<{ id: string; heading: string; body: string[]; bullets?: string[] }> {
  return lines(value).map((line, index) => {
    const [id = "", heading = "", body = "", bullets = ""] = line.split("|").map((part) => part.trim());
    const bodyParts = parts(body);
    if (!id || !heading || bodyParts.length === 0) {
      throw new Error(`form_Section ${index + 1} invalide : utilisez « identifiant|titre|paragraphe 1 ${SECTION_SEPARATOR} paragraphe 2 ».`);
    }
    const bulletParts = parts(bullets);
    return { id, heading, body: bodyParts, ...(bulletParts.length > 0 ? { bullets: bulletParts } : {}) };
  });
}

export function formatSections(sections: unknown): string {
  if (!Array.isArray(sections)) return "";
  return sections
    .map((section) => {
      const s = (section ?? {}) as { id?: unknown; heading?: unknown; body?: unknown; bullets?: unknown };
      const body = Array.isArray(s.body) ? s.body.map(String).join(` ${SECTION_SEPARATOR} `) : "";
      const bullets = Array.isArray(s.bullets) && s.bullets.length > 0 ? `|${s.bullets.map(String).join(` ${SECTION_SEPARATOR} `)}` : "";
      return `${String(s.id ?? "")}|${String(s.heading ?? "")}|${body}${bullets}`;
    })
    .join("\n");
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
