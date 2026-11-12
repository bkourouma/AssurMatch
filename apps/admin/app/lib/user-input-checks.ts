/**
 * Pure input checks of the Admin forms, run in the server action BEFORE the API call so the operator
 * reads a precise French message (field + rule) instead of a generic or technical refusal.
 * Not a "use server" module: it exports constants and plain helpers. The API stays the authority.
 */

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const REASON_MIN_LENGTH = 8;

export const DISPLAY_NAME_TOO_SHORT_MESSAGE = `Le nom doit contenir au moins ${DISPLAY_NAME_MIN_LENGTH} caractères.`;
export const REASON_TOO_SHORT_MESSAGE = `Le motif doit contenir au moins ${REASON_MIN_LENGTH} caractères.`;

/** Name of a user: at least 2 characters once trimmed. */
export function isDisplayNameValid(value: string): boolean {
  return value.trim().length >= DISPLAY_NAME_MIN_LENGTH;
}

/** Message of an invalid display name, or undefined when it is acceptable. */
export function displayNameError(value: string): string | undefined {
  return isDisplayNameValid(value) ? undefined : DISPLAY_NAME_TOO_SHORT_MESSAGE;
}

/** Audited reason of a sensitive change: at least 8 characters once trimmed (backend `reasonSchema`). */
export function reasonError(value: string): string | undefined {
  return value.trim().length >= REASON_MIN_LENGTH ? undefined : REASON_TOO_SHORT_MESSAGE;
}

/**
 * Backend validation refusals name the field (e.g. "A reason is required for sensitive changes"):
 * when the reason is the culprit, say so precisely; otherwise undefined so the caller keeps its
 * generic wording. Never echoes the raw backend text.
 */
export function reasonRuleFromBackendMessage(message: string | undefined): string | undefined {
  return message && /\breason\b/i.test(message) ? REASON_TOO_SHORT_MESSAGE : undefined;
}
