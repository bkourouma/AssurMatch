/**
 * Pure helpers of the quote form (no React, no I/O) so they stay unit-testable.
 *
 * E2E lot 5: a repeated quote request is answered by the API either with `{ status: "duplicate_ignored" }`
 * (no reference, no token) or with a 200 that echoes the original reference but no tracking token.
 * In both cases the visitor must read a plain sentence, never a technical code and never an empty link.
 */

export interface QuoteSubmitBody {
  status?: unknown;
  publicReference?: unknown;
  verificationToken?: unknown;
}

export type QuoteSubmitOutcome =
  | { kind: "created"; publicReference: string; verificationToken: string }
  | { kind: "already_received" };

/** Reads the 2xx body of `POST /quote-requests`; a body without a usable tracking token is a repeat. */
export function resolveQuoteSubmitOutcome(body: QuoteSubmitBody | null | undefined): QuoteSubmitOutcome {
  const status = typeof body?.status === "string" ? body.status.toLowerCase() : "";
  if (status === "duplicate" || status === "duplicate_ignored") return { kind: "already_received" };
  const reference = typeof body?.publicReference === "string" ? body.publicReference.trim() : "";
  const token = typeof body?.verificationToken === "string" ? body.verificationToken.trim() : "";
  if (!reference || !token) return { kind: "already_received" };
  return { kind: "created", publicReference: reference, verificationToken: token };
}

/** `answer_<key>` of a number field: a budget below zero is rejected (the input also carries min="0"). */
export function isNegativeNumber(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed < 0;
}

export interface NeedFieldDescriptor {
  key: string;
  type: string;
  required: boolean;
}

export interface NeedValidationMessages {
  required: string;
  negative: string;
}

/** Validation of the "need" step: required fields, and no negative value in a number field. */
export function validateNeedAnswers(
  fields: readonly NeedFieldDescriptor[],
  read: (name: string) => string,
  messages: NeedValidationMessages
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === "checkbox") continue;
    const value = read(`answer_${field.key}`).trim();
    if (!value) {
      if (field.required) errors[field.key] = messages.required;
      continue;
    }
    if (field.type === "number" && isNegativeNumber(value)) errors[field.key] = messages.negative;
  }
  return errors;
}
