/**
 * Lot 5 (spec 071): French wording of the add-on, subscription and plan-change screens of the admin
 * billing page. Pure module (no server import) so the static specs can read it directly. The values
 * mirror `billing-addons.contracts.ts` and `billing-plan-change.contracts.ts`; they are duplicated on
 * purpose because the Next app does not load runtime modules outside its own directory.
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

export const ADD_ON_KIND_LABELS: Record<string, string> = {
  api: "Accès API",
  white_label: "Marque blanche",
  ai: "Module IA"
};

export const ADD_ON_KIND_OPTIONS = Object.entries(ADD_ON_KIND_LABELS).map(([value, label]) => ({ value, label }));

export const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" }
];

export const PLAN_LABELS: Record<string, string> = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  suspended: "Suspendu",
  cancelled: "Résilié"
};

export const SUBSCRIPTION_STATUS_TONES: Record<string, "success" | "warning" | "danger"> = {
  active: "success",
  suspended: "warning",
  cancelled: "danger"
};

export const SUBSCRIPTION_STATUS_OPTIONS = Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => ({ value, label }));

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

export const PLAN_CHANGE_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  ...Object.entries(PLAN_CHANGE_STATUS_LABELS).map(([value, label]) => ({ value, label }))
];

export const PLAN_CHANGE_EFFECT_NOTICE =
  "Une demande acceptée prend effet au prochain cycle mensuel : le brouillon de ce cycle est calculé avec le nouveau plan. Aucun paiement en ligne.";

export const SUBSCRIPTION_ROUTING_NOTICE =
  "Cet état alimente le routage des leads : un abonnement suspendu ou résilié exclut le courtier (contrôle 11), et un contrat absent ou expiré l'exclut aussi (contrôle 9).";

/** Reasons of the machine API failures, worded for finance. */
export function lot5ErrorMessage(status: number, code?: string): string {
  if (status === 401) return "Session expirée : reconnectez-vous puis recommencez.";
  if (status === 403) return "Action refusée : rôle Finance Admin ou Super Admin requis.";
  if (status === 404) return "Élément introuvable : rechargez la page.";
  if (status === 409) return "Action impossible dans l'état actuel (module déjà affecté, demande déjà traitée ou état identique).";
  if (status === 422) return "Demande refusée : le module de facturation est désactivé ou une règle métier n'est pas respectée.";
  if (status === 400) return "Saisie invalide : vérifiez les champs et le motif (3 caractères au moins).";
  if (status === 0) return "API indisponible : réessayez dans quelques instants.";
  return `Erreur inattendue de l'API (${status}${code ? ` ${code}` : ""}).`;
}
