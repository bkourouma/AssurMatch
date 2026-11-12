/**
 * Pure helpers of the operations console actions (no "use server": a server-action module may only
 * export async functions). Validation before the API call and mapping of API refusals to French
 * messages, never exposing the raw technical message of the API.
 */

/** Same rule as the backend `reasonSchema` (packages/shared/validation/common.schemas.ts). */
export const REASON_MIN_LENGTH = 8;
export const REASON_MAX_LENGTH = 500;

export const REASON_TOO_SHORT_MESSAGE = `Le motif doit contenir au moins ${REASON_MIN_LENGTH} caractères.`;
export const REASON_TOO_LONG_MESSAGE = `Le motif ne doit pas dépasser ${REASON_MAX_LENGTH} caractères.`;

/** Error message for a mandatory audited reason, or null when valid. The value is expected trimmed. */
export function validateRequiredReason(reason: string): string | null {
  if (reason.length < REASON_MIN_LENGTH) return REASON_TOO_SHORT_MESSAGE;
  if (reason.length > REASON_MAX_LENGTH) return REASON_TOO_LONG_MESSAGE;
  return null;
}

/** Optional note: empty is fine, a too long one is refused (the backend only caps the length). */
export function validateOptionalReason(reason: string): string | null {
  return reason.length > REASON_MAX_LENGTH ? REASON_TOO_LONG_MESSAGE : null;
}

const REFUSAL_REASONS: Record<number, string> = {
  0: "API indisponible : réessayez plus tard.",
  400: "Saisie invalide : vérifiez les champs du formulaire et réessayez.",
  401: "Session expirée : reconnectez-vous.",
  403: "Action refusée pour votre rôle ou hors de votre périmètre pays (refus audité).",
  404: "Élément introuvable (référence ou identifiant inconnu).",
  409: "Conflit : l'élément a déjà été traité ou la cible est identique.",
  422: "Refus de conformité : consentement absent ou retiré, ou courtier partenaire non éligible. Rien n'a été transmis."
};

/** French message of an API refusal. The raw API message is deliberately never appended. */
export function refusalMessage(status: number): string {
  return REFUSAL_REASONS[status] ?? "Action refusée par le serveur. Réessayez ou contactez l'administrateur.";
}
