import type { PublicQuoteFormField } from "./public-api";

/**
 * Constitution V: personal data sent to a model is minimised, and the visitor AI assistants only
 * ever need the product question answers. The backend gateway minimises again (identity keys,
 * e-mail / phone patterns), but this allow-list keeps contact data out of the request in the first
 * place, so the browser never sends what the model must not see.
 *
 * Allow-list, per field of the published definition:
 * - `sensitivity` must be "public" (a "personal" or "sensitive" field is never forwarded);
 * - `type` must be text, number, select or date (email, phone and checkbox fields are dropped:
 *   checkboxes carry declarations and consent, not product facts);
 * - the key must not look like a contact, consent or document key.
 * Contact details (name, e-mail, phone) are not part of the definition's answers at all - they live
 * in separate form controls - so they cannot reach this helper; the key guard is defence in depth.
 */
const ALLOWED_TYPES: ReadonlySet<PublicQuoteFormField["type"]> = new Set(["text", "number", "select", "date"]);

const FORBIDDEN_KEY = /(e[-_]?mail|phone|tel|mobile|whatsapp|name|address|street|city|postal|zip|birth|passport|national|id[-_]?number|iban|card|password|token|consent|accept|document|upload|attachment|file)/i;

/** Mirrors the backend `answersSchema` key bound (z.string().max(64)). */
const MAX_KEY_LENGTH = 64;

export function visitorAiAnswers(
  answers: Record<string, unknown>,
  fields: ReadonlyArray<Pick<PublicQuoteFormField, "key" | "type" | "sensitivity">>
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.sensitivity !== "public") continue;
    if (!ALLOWED_TYPES.has(field.type)) continue;
    if (field.key.length > MAX_KEY_LENGTH || FORBIDDEN_KEY.test(field.key)) continue;
    if (!Object.prototype.hasOwnProperty.call(answers, field.key)) continue;
    const value = answers[field.key];
    if (typeof value === "string" ? value.length === 0 : typeof value === "number" ? !Number.isFinite(value) : true) continue;
    safe[field.key] = value;
  }
  return safe;
}
