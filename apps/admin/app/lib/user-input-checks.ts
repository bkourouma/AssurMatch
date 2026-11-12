/**
 * Pure input checks of the Admin forms, run in the server action BEFORE the API call so the operator
 * reads a precise French message (field + rule) instead of a generic or technical refusal.
 * Not a "use server" module: it exports constants and plain helpers (server action files may only
 * export async functions). The API stays the authority and still validates everything.
 */

import { REASON_MIN_LENGTH, REASON_TOO_SHORT_MESSAGE } from "./operations-validation";

// Single source of the reason rule: operations-validation.ts. Re-exported for the existing callers.
export { REASON_MIN_LENGTH, REASON_TOO_SHORT_MESSAGE };
/** Alias kept for the former name of the audited reason minimum. */
export const AUDIT_REASON_MIN_LENGTH = REASON_MIN_LENGTH;

export const DISPLAY_NAME_MIN_LENGTH = 2;
/** `partnerUserInviteSchema` (packages/shared/contracts/partner.contracts.ts): displayName min(2). */
export const PARTNER_USER_DISPLAY_NAME_MIN_LENGTH = DISPLAY_NAME_MIN_LENGTH;

export const DISPLAY_NAME_TOO_SHORT_MESSAGE = `Le nom doit contenir au moins ${DISPLAY_NAME_MIN_LENGTH} caractères.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const USER_INPUT_MESSAGES = {
  displayNameTooShort: `Nom affiché trop court : au moins ${PARTNER_USER_DISPLAY_NAME_MIN_LENGTH} caractères.`,
  scopeNotUuid: "Périmètre invalide : saisissez des identifiants (UUID) de pays et de produits séparés par des virgules, pas des codes comme « CI » ou « auto ».",
  reasonTooShort: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.`
} as const;

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

/** Message when the display name of an invited partner user is too short (1 character), else undefined. */
export function partnerUserDisplayNameError(displayName: string): string | undefined {
  return displayName.trim().length < PARTNER_USER_DISPLAY_NAME_MIN_LENGTH ? USER_INPUT_MESSAGES.displayNameTooShort : undefined;
}

/** Message of the first invalid field among the country/product scopes and the reason, if any. */
export function adminUserScopeAndReasonError(input: { countryIds: readonly string[]; productIds: readonly string[]; reason: string }): string | undefined {
  if ([...input.countryIds, ...input.productIds].some((id) => !UUID.test(id))) return USER_INPUT_MESSAGES.scopeNotUuid;
  if (input.reason.trim().length < REASON_MIN_LENGTH) return USER_INPUT_MESSAGES.reasonTooShort;
  return undefined;
}
