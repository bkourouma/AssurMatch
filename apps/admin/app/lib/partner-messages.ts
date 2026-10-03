/**
 * Spec 051: wording, role gates and navigation helpers of the partner (courtier) screens. Plain
 * module (no "use server"): server pages, server actions and client forms may all import it.
 *
 * The role gates only hide what the API would refuse anyway (R13): the API stays the authority and
 * re-checks role, country scope and MFA on every call.
 */
import type {
  AccreditationDocumentType,
  PartnerEffectiveStatus,
  PartnerPlan,
  PartnerUserRole
} from "../../../../packages/shared/contracts/partner.contracts";
import type {
  PartnerApplicationRejectionReasonCode,
  PartnerApplicationStatus
} from "../../../../packages/shared/contracts/partner-application.contracts";
import type { Tone } from "./ui/admin-ui";

/** R1: PRD labels of the stored statuses, plus the computed "Expiré". */
export const PARTNER_STATUS_LABELS: Record<PartnerEffectiveStatus, string> = {
  draft: "Prospect",
  pending_compliance: "En vérification",
  active_test: "Actif test",
  active: "Actif public",
  suspended: "Suspendu",
  expired: "Expiré",
  retired: "Résilié"
};

export const PARTNER_STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  pending_compliance: "warning",
  active_test: "info",
  active: "success",
  suspended: "danger",
  expired: "danger",
  retired: "disabled"
};

export const PARTNER_STATUS_FILTER_OPTIONS = ["draft", "pending_compliance", "active_test", "active", "suspended", "expired", "retired"] as const satisfies readonly PartnerEffectiveStatus[];

export function partnerStatusLabel(status: string | null | undefined): string {
  if (!status) return "-";
  return PARTNER_STATUS_LABELS[status as PartnerEffectiveStatus] ?? status;
}

/** Verb shown on a transition button, per target status. */
export const PARTNER_TRANSITION_LABELS: Record<string, string> = {
  pending_compliance: "Envoyer en vérification",
  active_test: "Passer en Actif test",
  active: "Passer en Actif public",
  suspended: "Suspendre",
  retired: "Résilier"
};

/** Transitions confirmed in a dialog (suspension and termination). */
export const PARTNER_SENSITIVE_TRANSITIONS = new Set(["suspended", "retired"]);

export const PARTNER_PLAN_OPTIONS = ["starter", "pro", "enterprise"] as const satisfies readonly PartnerPlan[];
export const PARTNER_PLAN_LABELS: Record<PartnerPlan, string> = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };
export const PARTNER_CAPACITY_OPTIONS = ["available", "limited", "full", "blocked"] as const;
export const PARTNER_CAPACITY_LABELS: Record<string, string> = {
  available: "Disponible",
  limited: "Limitée",
  full: "Complète",
  blocked: "Bloquée"
};

export const LICENSE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending_review: "En revue",
  valid: "Valide",
  expired: "Expirée",
  suspended: "Suspendue",
  invalid: "Invalide",
  revoked: "Révoquée",
  superseded: "Remplacée"
};

export const LICENSE_STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  pending_review: "warning",
  valid: "success",
  expired: "danger",
  suspended: "danger",
  invalid: "danger",
  revoked: "disabled",
  superseded: "disabled"
};

export const DOCUMENT_TYPE_OPTIONS = [
  "license",
  "registration",
  "identity",
  "mandate",
  "compliance_certificate",
  "partnership_contract",
  "other"
] as const satisfies readonly AccreditationDocumentType[];

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  license: "Licence / agrément",
  registration: "Immatriculation (RCCM)",
  identity: "Pièce d'identité du dirigeant",
  mandate: "Mandat",
  compliance_certificate: "Attestation de conformité",
  partnership_contract: "Contrat de partenariat signé",
  other: "Autre"
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Déposé",
  pending_review: "En revue",
  accepted: "Accepté",
  rejected: "Refusé",
  expired: "Expiré",
  superseded: "Remplacé"
};

export const SCAN_STATUS_LABELS: Record<string, string> = {
  pending: "Analyse en attente",
  clean: "Sain",
  infected: "Infecté (quarantaine)",
  failed: "Analyse en échec"
};

export const SCAN_STATUS_TONES: Record<string, Tone> = {
  pending: "warning",
  clean: "success",
  infected: "danger",
  failed: "danger"
};

/** Same limits as the API (`ACCREDITATION_DOCUMENT_MAX_BYTES`, `accreditationDocumentMimeTypes`). */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png";
/** Header the upload form sets and the upload route handler requires (CSRF guard). */
export const UPLOAD_CSRF_HEADER = "x-assurmatch-upload";

/** R11: broker roles only; the owner role follows the plan. */
export const PARTNER_USER_ROLE_OPTIONS = ["broker_owner_starter", "broker_owner_pro", "broker_manager", "broker_agent", "broker_read_only"] as const satisfies readonly PartnerUserRole[];
export const PARTNER_OWNER_ROLES = ["broker_owner_starter", "broker_owner_pro"] as const;
export const PARTNER_USER_ROLE_LABELS: Record<string, string> = {
  broker_owner_starter: "Propriétaire Starter",
  broker_owner_pro: "Propriétaire Pro",
  broker_manager: "Manager",
  broker_agent: "Conseiller",
  broker_read_only: "Lecture seule"
};

export function ownerRoleForPlan(plan: string): (typeof PARTNER_OWNER_ROLES)[number] {
  return plan === "starter" ? "broker_owner_starter" : "broker_owner_pro";
}

/** Roles proposed on the invitation form: the owner role of another plan is never offered. */
export function inviteRoleOptions(plan: string): PartnerUserRole[] {
  const owner = ownerRoleForPlan(plan);
  return PARTNER_USER_ROLE_OPTIONS.filter((role) => !(PARTNER_OWNER_ROLES as readonly string[]).includes(role) || role === owner);
}

export const APPLICATION_STATUS_OPTIONS = ["received", "under_review", "accepted", "rejected"] as const satisfies readonly PartnerApplicationStatus[];
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  received: "Reçue",
  under_review: "En examen",
  accepted: "Convertie",
  rejected: "Refusée"
};
export const APPLICATION_STATUS_TONES: Record<string, Tone> = {
  received: "info",
  under_review: "warning",
  accepted: "success",
  rejected: "disabled"
};

export const REJECTION_REASON_OPTIONS = [
  "license_unverifiable",
  "out_of_coverage",
  "incomplete_information",
  "insufficient_capacity",
  "other"
] as const satisfies readonly PartnerApplicationRejectionReasonCode[];
export const REJECTION_REASON_LABELS: Record<string, string> = {
  license_unverifiable: "Licence invérifiable",
  out_of_coverage: "Hors couverture",
  incomplete_information: "Informations incomplètes",
  insufficient_capacity: "Capacité insuffisante",
  other: "Autre motif"
};

/* ------------------------------------------------------------------------------- role gates */

const DECISION_ROLES = ["compliance_admin", "super_admin"] as const;
/** Roles holding `partners:update` / `licenses:create` / `documents:create` (R13). */
const PREPARATION_ROLES = ["compliance_admin", "super_admin", "admin_pays"] as const;

function hasAny(roles: readonly string[] | undefined, allowed: readonly string[]): boolean {
  return (roles ?? []).some((role) => allowed.includes(role));
}

/** Compliance-only actions: activation, suspension, termination, licence validation, document review, application decision. */
export function canDecidePartner(roles: readonly string[] | undefined): boolean {
  return hasAny(roles, DECISION_ROLES);
}

/** Creation and preparation (identity, licences, documents, contract, coverage, invitations). Never `support_admin`. */
export function canPreparePartner(roles: readonly string[] | undefined): boolean {
  return hasAny(roles, PREPARATION_ROLES);
}

/** `documents:read`: the document content is never opened by `support_admin`. */
export function canDownloadPartnerDocuments(roles: readonly string[] | undefined): boolean {
  return hasAny(roles, PREPARATION_ROLES);
}

/** `partner_applications:review` (received -> under_review). */
export function canReviewApplication(roles: readonly string[] | undefined): boolean {
  return hasAny(roles, PREPARATION_ROLES);
}

/* ---------------------------------------------------------------------- activation conditions */

/**
 * "Corriger" anchors of the partner page for every activation condition (R3). The country flag is
 * fixed on the catalogue country page.
 */
export function partnerBlockerHref(control: string, partner: { id: string; countryId: string | null }): string | undefined {
  switch (control) {
    case "license_valid_with_document":
      return "#licences";
    case "coverage_country":
    case "coverage_product":
      return "#couverture";
    case "owner_user":
      return "#utilisateurs";
    case "contract_recorded":
      return "#contrat";
    case "country_broker_onboarding_enabled":
      return partner.countryId ? `/catalog/countries/${encodeURIComponent(partner.countryId)}` : "#identite";
    default:
      return undefined;
  }
}

/** Spec 053: broker requests shown in « Demandes du courtier ». */
export const PARTNER_REQUEST_TYPE_LABELS: Record<string, string> = {
  profile_change: "Modification d'identité",
  coverage_extension: "Extension de couverture"
};

export const PARTNER_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  cancelled: "Annulée par le courtier"
};

export const PARTNER_REQUEST_STATUS_TONES: Record<string, "warning" | "success" | "danger" | "disabled"> = {
  pending: "warning",
  accepted: "success",
  rejected: "danger",
  cancelled: "disabled"
};

export const PARTNER_REQUEST_FIELD_LABELS: Record<string, string> = {
  legalName: "Raison sociale",
  tradeName: "Nom commercial",
  registrationNumber: "RCCM",
  countryId: "Pays",
  productId: "Produit"
};

export function partnerFormatDate(value?: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}

/** Days between today and a date (negative when past). */
export function daysUntil(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - now.getTime()) / 86_400_000);
}
