import { TENANT_SUSPENDED_MESSAGE } from "./broker-permissions";

/**
 * Spec 053: French labels and refusal messages of the broker self-service screens (company
 * profile, licences, team). Pure module: no server import, so the static tests read it directly.
 */

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  profile_change: "Modification d'identité",
  coverage_extension: "Extension de couverture"
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "En attente d'AssurMatch",
  accepted: "Acceptée",
  rejected: "Refusée",
  cancelled: "Annulée"
};

export const REQUEST_STATUS_TONES: Record<string, "info" | "success" | "danger" | "disabled" | "warning"> = {
  pending: "warning",
  accepted: "success",
  rejected: "danger",
  cancelled: "disabled"
};

export const REQUEST_FIELD_LABELS: Record<string, string> = {
  legalName: "Raison sociale",
  tradeName: "Nom commercial",
  registrationNumber: "RCCM",
  countryId: "Pays",
  productId: "Produit"
};

export const LICENSE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending_review: "En revue par la conformité",
  valid: "Valide",
  expired: "Expirée",
  suspended: "Suspendue",
  invalid: "Invalide",
  revoked: "Révoquée",
  superseded: "Remplacée"
};

export const LICENSE_STATUS_TONES: Record<string, "info" | "success" | "danger" | "disabled" | "warning"> = {
  draft: "info",
  pending_review: "warning",
  valid: "success",
  expired: "danger",
  suspended: "danger",
  invalid: "danger",
  revoked: "danger",
  superseded: "disabled"
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Déposé, en attente de revue",
  pending_review: "En revue",
  accepted: "Accepté",
  rejected: "Refusé",
  expired: "Expiré",
  superseded: "Remplacé"
};

export const SCAN_STATUS_LABELS: Record<string, string> = {
  pending: "Analyse en cours",
  clean: "Analysé sain",
  infected: "Quarantaine",
  failed: "Analyse en échec"
};

export const PARTNER_STATUS_LABELS: Record<string, string> = {
  draft: "Prospect",
  pending_compliance: "En vérification",
  active_test: "Actif test",
  active: "Actif public",
  suspended: "Suspendu",
  expired: "Expiré",
  retired: "Résilié"
};

export const PLAN_LABELS: Record<string, string> = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

export const CAPACITY_LABELS: Record<string, string> = { available: "Disponible", limited: "Limitée", full: "Complète", blocked: "Bloquée" };

export const TEAM_ROLE_LABELS: Record<string, string> = {
  broker_owner_starter: "Propriétaire Starter",
  broker_owner_pro: "Propriétaire Pro",
  broker_manager: "Manager",
  broker_agent: "Agent",
  broker_read_only: "Lecture seule"
};

/** Spec 053 R5: the roles an owner or a manager may give (the owner role is an AssurMatch decision). */
export const TEAM_INVITE_ROLE_OPTIONS = [
  { value: "broker_manager", label: "Manager" },
  { value: "broker_agent", label: "Agent" },
  { value: "broker_read_only", label: "Lecture seule" }
] as const;

export const TEAM_STATUS_LABELS: Record<string, string> = {
  invited: "Invité (activation en attente)",
  active: "Actif",
  suspended: "Désactivé",
  locked: "Verrouillé"
};

/** Spec 053 FR-007: same limits as the API (`ACCREDITATION_DOCUMENT_MAX_BYTES`, MIME allow-list). */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_ACCEPT = "application/pdf,image/jpeg,image/png";
export const UPLOAD_CSRF_HEADER = "x-assurmatch-upload";

export const SELF_SERVICE_ERROR_MESSAGES: Record<string, string> = {
  PARTNER_SUSPENDED: TENANT_SUSPENDED_MESSAGE,
  PARTNER_REQUEST_PENDING: "Une demande identique est déjà en attente de décision d'AssurMatch.",
  PARTNER_REQUEST_ALREADY_DECIDED: "Cette demande a déjà été traitée : rechargez la page.",
  PARTNER_UPDATE_CONFLICT: "La fiche a été modifiée entre-temps : rechargez la page puis recommencez.",
  LICENSE_TRANSITION_INVALID: "Action impossible pour cette licence dans son état actuel (renouvellement déjà en cours, licence révoquée ou remplacée).",
  LICENSE_EXPIRED: "La date d'expiration du renouvellement doit être future.",
  DOCUMENT_INVALID: "Fichier refusé : PDF, JPEG ou PNG de 5 Mo au plus, au contenu conforme à son type.",
  DOCUMENT_STORAGE_NOT_CONFIGURED: "Dépôt indisponible : le stockage des documents n'est pas configuré. Contactez AssurMatch.",
  TEAM_LAST_OWNER: "Le dernier propriétaire actif ne peut pas être désactivé.",
  TEAM_SELF_ACTION: "Vous ne pouvez pas modifier votre propre accès ni votre propre rôle."
};

export function selfServiceErrorMessage(result: { status: number; code?: string | undefined; suspended?: boolean | undefined }): string {
  if (result.suspended) return TENANT_SUSPENDED_MESSAGE;
  const message = result.code ? SELF_SERVICE_ERROR_MESSAGES[result.code] : undefined;
  if (message) return message;
  if (result.status === 400) return "Données invalides : vérifiez les champs (e-mail, téléphone au format +225..., justification de 10 caractères au moins, motif de 8 caractères au moins).";
  if (result.status === 401 || result.code === "session_required") return "Session expirée : reconnectez-vous puis recommencez.";
  if (result.status === 403) return "Action refusée : seuls le propriétaire et les managers du courtier peuvent faire cette action.";
  if (result.status === 404) return "Élément introuvable : rechargez la page.";
  if (result.status === 409) return "Action impossible dans l'état actuel (déjà autorisé, déjà traité ou adresse indisponible).";
  if (result.status === 413) return "Fichier trop volumineux : 5 Mo au maximum.";
  if (result.status === 422) return "Demande refusée : vérifiez les valeurs saisies.";
  if (result.status === 0) return "API indisponible : réessayez dans quelques instants.";
  return `Erreur inattendue de l'API (${result.status}${result.code ? ` ${result.code}` : ""}).`;
}

export function selfServiceFormatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}
