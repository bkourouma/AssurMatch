/**
 * Lot 5 (spec 071): French wording of the broker "Changer de plan" section and of the new invoice line
 * kinds. Pure module (no server import) so the static specs can read it directly.
 */

export const BILLING_LINE_KIND_LABELS: Record<string, string> = {
  subscription: "Abonnement mensuel",
  billable_leads: "Leads facturables",
  shared_leads: "Leads partagés",
  pack_credit: "Crédit de pack de leads",
  dispute_credit: "Crédit de contestation",
  setup_fee: "Frais d'installation (une seule fois)",
  add_on: "Module complémentaire"
};

/** Label of a draft or invoice line kind; an unknown kind keeps its raw value. */
export function billingLineKindLabel(kind: string): string {
  return BILLING_LINE_KIND_LABELS[kind] ?? kind;
}

export const PLAN_LABELS: Record<string, string> = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

export const PLAN_CHANGE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  refused: "Refusée",
  cancelled: "Annulée"
};

export const PLAN_CHANGE_STATUS_TONES: Record<string, "warning" | "success" | "danger" | "disabled"> = {
  pending: "warning",
  accepted: "success",
  refused: "danger",
  cancelled: "disabled"
};

export const PLAN_CHANGE_NO_PAYMENT_NOTICE = "Aucun paiement en ligne: votre demande est traitée par l'équipe AssurMatch.";

export const PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH = 10;
export const PLAN_CHANGE_JUSTIFICATION_MAX_LENGTH = 500;

/** Refusal messages of the plan-change calls. The API stays the authority; these only explain it. */
export function planChangeErrorMessage(result: { status: number; suspended?: boolean | undefined }): string {
  if (result.suspended) return "Compte suspendu : consultation seule. Contactez AssurMatch.";
  if (result.status === 401) return "Session expirée : reconnectez-vous puis recommencez.";
  if (result.status === 400) return `Données invalides : choisissez un plan et saisissez une justification de ${PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH} caractères au moins.`;
  if (result.status === 403) return "Action refusée : seul le propriétaire du cabinet peut demander un changement de plan.";
  if (result.status === 404) return "Demande introuvable : rechargez la page.";
  if (result.status === 409) return "Action impossible dans l'état actuel (une demande est déjà en attente, le plan demandé est déjà le vôtre ou la demande est déjà traitée).";
  if (result.status === 422) return "Demande refusée : vérifiez les valeurs saisies.";
  if (result.status === 0) return "API indisponible : réessayez dans quelques instants.";
  return `Erreur inattendue de l'API (${result.status}).`;
}
