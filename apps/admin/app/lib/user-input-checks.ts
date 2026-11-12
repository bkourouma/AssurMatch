/**
 * Field-level checks of the admin user forms (pure module, no "use server": server action files may
 * only export async functions). The API answers a generic 400 for any invalid field, so without these
 * the operator was told "the reason must have 8 characters" whatever the real problem was. Each
 * check names the field that is wrong; the API stays the authority and still validates everything.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `partnerUserInviteSchema` (packages/shared/contracts/partner.contracts.ts): displayName min(2). */
export const PARTNER_USER_DISPLAY_NAME_MIN_LENGTH = 2;
export const AUDIT_REASON_MIN_LENGTH = 8;

export const USER_INPUT_MESSAGES = {
  displayNameTooShort: `Nom affiché trop court : au moins ${PARTNER_USER_DISPLAY_NAME_MIN_LENGTH} caractères.`,
  scopeNotUuid: "Périmètre invalide : saisissez des identifiants (UUID) de pays et de produits séparés par des virgules, pas des codes comme « CI » ou « auto ».",
  reasonTooShort: `Motif obligatoire : au moins ${AUDIT_REASON_MIN_LENGTH} caractères, conservé dans l'audit.`
} as const;

/** Message when the display name of an invited partner user is too short (1 character), else undefined. */
export function partnerUserDisplayNameError(displayName: string): string | undefined {
  return displayName.trim().length < PARTNER_USER_DISPLAY_NAME_MIN_LENGTH ? USER_INPUT_MESSAGES.displayNameTooShort : undefined;
}

/** Message of the first invalid field among the country/product scopes and the reason, if any. */
export function adminUserScopeAndReasonError(input: { countryIds: readonly string[]; productIds: readonly string[]; reason: string }): string | undefined {
  if ([...input.countryIds, ...input.productIds].some((id) => !UUID.test(id))) return USER_INPUT_MESSAGES.scopeNotUuid;
  if (input.reason.trim().length < AUDIT_REASON_MIN_LENGTH) return USER_INPUT_MESSAGES.reasonTooShort;
  return undefined;
}
