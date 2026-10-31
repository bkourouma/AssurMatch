import { OFFER_BLOCKER_LABELS } from "../offer-messages";
import { CANDIDATE_REASON_LABELS, PARKED_REASON_LABELS } from "../../routing/routing-labels";

/**
 * French wording of the raw codes the operations consoles receive from the API (statuses, routing
 * reasons, form answers). Pure module: no React, so the static specs can read it directly.
 *
 * Rule: an unknown code is humanized (`some_code` becomes `Some code`) instead of being shown raw, so a
 * new API value never reaches the screen as a technical identifier. Contract values are never changed:
 * these helpers only decide what is displayed.
 */

/** `vehicle_use` / `vehicleUse` -> `Vehicle use`: last-resort readable form of a code. */
export function humanizeCode(code: string): string {
  const spaced = code
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : code;
}

function labelOf(map: Record<string, string>, code: string | null | undefined, empty = "-"): string {
  if (code === null || code === undefined || code === "") return empty;
  return map[code] ?? humanizeCode(code);
}

/** `vehicleUse`, `VEHICLE_USE` and `vehicle_use` all name the same form field. */
export function normalizeAnswerKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}

/** Libellé d'affichage d'un produit du catalogue: la clé (`auto`, `voyage`) reste la valeur des filtres et des liens. */
export const PRODUCT_LABELS: Record<string, string> = {
  auto: "Auto",
  voyage: "Voyage",
  sante: "Santé",
  habitation: "Habitation",
  moto: "Moto"
};

export function productLabel(key: string | null | undefined): string {
  const raw = (key ?? "").trim();
  if (!raw || raw === "-") return "-";
  return PRODUCT_LABELS[raw.toLowerCase()] ?? humanizeCode(raw);
}

// ---- statuses -------------------------------------------------------------------------------

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft_refused: "Brouillon refusé",
  created: "Créée",
  manual_review: "En revue manuelle",
  routed: "Routée",
  non_routable: "Non routable",
  duplicate: "Doublon",
  spam_blocked: "Bloquée (anti-spam)",
  cancelled: "Annulée"
};

export const ROUTING_STATUS_LABELS: Record<string, string> = {
  not_started: "Non démarré",
  eligible: "Éligible",
  assigned: "Affecté",
  blocked: "Bloqué",
  no_broker_available: "Aucun courtier disponible",
  manual_review_required: "Revue manuelle requise",
  pending_manual_assignment: "Affectation manuelle en attente"
};

export const DUPLICATE_STATUS_LABELS: Record<string, string> = {
  not_checked: "Non vérifié",
  unique: "Unique",
  possible_duplicate: "Doublon possible",
  blocked_duplicate: "Doublon bloqué"
};

export const CONSENT_STATUS_LABELS: Record<string, string> = {
  granted: "Accordé",
  withdrawn: "Retiré",
  expired: "Expiré",
  anonymized: "Anonymisé"
};

export const CONSENT_CHANNEL_LABELS: Record<string, string> = {
  public_web: "Site public",
  admin: "Back-office plateforme",
  broker: "Espace courtier",
  api: "API"
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  assigned: "Affecté",
  broker_notified: "Courtier notifié",
  seen: "Vu par le courtier",
  accepted: "Accepté",
  received: "Reçu",
  contacted: "Contacté",
  rejected: "Refusé",
  closed: "Clôturé",
  disputed: "Contesté"
};

export const ROUTING_RESULT_LABELS: Record<string, string> = {
  assigned: "Affecté",
  blocked: "Bloqué",
  no_broker_available: "Aucun courtier disponible",
  pending_manual_assignment: "Affectation manuelle en attente"
};

export const DOCUMENT_SCAN_LABELS: Record<string, string> = {
  pending: "Analyse en attente",
  clean: "Sain",
  infected: "Infecté",
  failed: "Analyse en échec"
};

export const DOCUMENT_KIND_LABELS: Record<string, string> = {
  identity: "Pièce d'identité",
  vehicle_registration: "Carte grise",
  driving_license: "Permis de conduire",
  proof_of_address: "Justificatif de domicile",
  medical_form: "Questionnaire médical",
  existing_policy: "Contrat existant",
  other: "Autre document"
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Téléversé",
  available: "Disponible",
  quarantined: "En quarantaine",
  removed: "Supprimé"
};

export const quoteStatusLabel = (status: string | null | undefined) => labelOf(QUOTE_STATUS_LABELS, status);
export const routingStatusLabel = (status: string | null | undefined) => labelOf(ROUTING_STATUS_LABELS, status);
export const duplicateStatusLabel = (status: string | null | undefined) => labelOf(DUPLICATE_STATUS_LABELS, status);
export const consentStatusLabel = (status: string | null | undefined) => labelOf(CONSENT_STATUS_LABELS, status, "Inconnu");
export const consentChannelLabel = (channel: string | null | undefined) => labelOf(CONSENT_CHANNEL_LABELS, channel);
export const assignmentStatusLabel = (status: string | null | undefined) => labelOf(ASSIGNMENT_STATUS_LABELS, status);
export const routingResultLabel = (result: string | null | undefined) => labelOf(ROUTING_RESULT_LABELS, result);
export const documentScanLabel = (status: string | null | undefined) => labelOf(DOCUMENT_SCAN_LABELS, status);
export const documentKindLabel = (kind: string | null | undefined) => labelOf(DOCUMENT_KIND_LABELS, kind);
export const documentStatusLabel = (status: string | null | undefined) => labelOf(DOCUMENT_STATUS_LABELS, status);

// ---- routing reasons ------------------------------------------------------------------------

/** Reasons recorded on routing decisions and assignments, on top of the eligibility blockers. */
export const ROUTING_REASON_LABELS: Record<string, string> = {
  ...OFFER_BLOCKER_LABELS,
  ...CANDIDATE_REASON_LABELS,
  ...PARKED_REASON_LABELS,
  selected_offer_partner: "Courtier de l'offre choisie",
  chosen_broker: "Courtier choisi par le visiteur",
  consent_missing: "Consentement de transmission absent",
  no_eligible_broker: "Aucun courtier éligible",
  manual_assignment_required: "Affectation manuelle requise",
  admin_manual_assignment: "Affectation manuelle par un admin",
  admin_reassigned: "Réaffecté par un admin",
  suggestion_not_eligible: "Suggestion IA non éligible",
  lead_quality_unavailable: "Qualité du lead indisponible (revue manuelle)",
  quota_lock_timeout: "Quota indisponible (délai dépassé), affectation manuelle",
  partner_quota_exhausted: "Quota mensuel de leads épuisé",
  accreditation_document_missing: "Preuve d'agrément absente ou non acceptée",
  exclusive_rule: "Règle exclusive : un autre courtier est désigné",
  exclusive_selected: "Courtier exclusif retenu",
  exclusive_partner_not_eligible: "Le courtier exclusif n'est pas éligible",
  eligible_broker_selected: "Premier courtier éligible retenu",
  round_robin_selected: "Rotation entre courtiers",
  priority_selected: "Priorité commerciale",
  capacity_selected: "Capacité restante la plus élevée",
  performance_selected: "Meilleure performance récente",
  multi_broker_routing_disabled: "Routage multi-courtiers désactivé : un seul courtier retenu",
  consent_covers_single_broker: "Le consentement ne nomme qu'un courtier : un seul retenu",
  consent_not_covering: "Courtier non nommé dans le consentement",
  not_candidate: "Courtier non candidat",
  not_eligible: "Courtier non éligible",
  rule_applied: "Règle de routage appliquée"
};

/**
 * Label of a routing reason. Some reasons carry a parameter (`preferred_partner_skipped:<code>`,
 * `selected_offer_partner_unavailable:<code>`, `admin_manual_assignment:<note>`, `multi_send_selected_3`).
 */
export function routingReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "-";
  const multi = /^multi_send_selected_(\d+)$/.exec(reason);
  if (multi) return `Envoi à ${multi[1]} courtiers partenaires`;
  const separator = reason.indexOf(":");
  if (separator > 0) {
    const head = reason.slice(0, separator);
    const tail = reason.slice(separator + 1);
    if (head === "preferred_partner_skipped") return `Courtier préféré écarté : ${routingReasonLabel(tail)}`;
    if (head === "selected_offer_partner_unavailable") return `Courtier de l'offre indisponible : ${routingReasonLabel(tail)}`;
    if (head === "admin_manual_assignment") return `${ROUTING_REASON_LABELS.admin_manual_assignment} : ${tail}`;
    return `${routingReasonLabel(head)} : ${routingReasonLabel(tail)}`;
  }
  return ROUTING_REASON_LABELS[reason] ?? humanizeCode(reason);
}

/** Several reasons, comma separated; `fallback` when the list is empty. */
export function routingReasonsLabel(reasons: readonly string[], fallback = "-"): string {
  return reasons.length === 0 ? fallback : reasons.map(routingReasonLabel).join(", ");
}

// ---- consent recipient ----------------------------------------------------------------------

/** `partner:<uuid>` / `partners:<uuid>,<uuid>` name the brokers the visitor agreed to; anything else is shown as recorded. */
export function consentRecipientLabel(recipient: string | null | undefined): string {
  if (!recipient) return "-";
  const short = (id: string) => id.trim().slice(0, 8);
  if (recipient.startsWith("partners:")) {
    const ids = recipient.slice("partners:".length).split(",").filter((id) => id.trim().length > 0);
    return `Courtiers partenaires nommés (${ids.length}) : ${ids.map(short).join(", ")}`;
  }
  if (recipient.startsWith("partner:")) return `Courtier partenaire nommé (${short(recipient.slice("partner:".length))})`;
  if (recipient === "courtier_partenaire_eligible") return "Courtier partenaire éligible";
  return recipient;
}

// ---- quote form answers ---------------------------------------------------------------------

/**
 * Field labels of the quote forms. The admin quote-form listing does not carry the field definitions,
 * so the wording of the generic fields and of the common product fields lives here; an unknown key is
 * humanized.
 */
export const QUOTE_ANSWER_LABELS: Record<string, string> = {
  city: "Ville",
  usage: "Usage",
  vehicle_use: "Usage du véhicule",
  vehicle_brand: "Marque du véhicule",
  vehicle_model: "Modèle du véhicule",
  vehicle_year: "Année du véhicule",
  contact_preference: "Moyen de contact préféré",
  contact_email: "E-mail de contact",
  desired_timing: "Délai souhaité",
  budget: "Budget indicatif",
  preferred_language: "Langue préférée",
  source: "Origine de la demande",
  notes: "Notes",
  full_name: "Nom complet",
  home_address: "Adresse du domicile",
  health_state: "État de santé"
};

export function quoteAnswerLabel(key: string): string {
  const normalized = normalizeAnswerKey(key);
  return QUOTE_ANSWER_LABELS[normalized] ?? humanizeCode(normalized);
}

const USAGE_OPTION_LABELS: Record<string, string> = { prive: "Privé", personnel: "Personnel", professionnel: "Professionnel" };

/** Option labels of the select fields, per field; a free-text answer is never in these maps. */
export const QUOTE_ANSWER_OPTION_LABELS: Record<string, Record<string, string>> = {
  vehicle_use: USAGE_OPTION_LABELS,
  usage: USAGE_OPTION_LABELS,
  contact_preference: { phone: "Téléphone", telephone: "Téléphone", email: "E-mail", whatsapp: "WhatsApp" },
  desired_timing: { immediate: "Immédiat", within_month: "Sous un mois", within_quarter: "Sous un trimestre" },
  preferred_language: { fr: "Français", en: "Anglais" },
  source: { search: "Moteur de recherche", social: "Réseaux sociaux", word_of_mouth: "Bouche-à-oreille", partner: "Partenaire", other: "Autre" }
};

export function quoteAnswerValueLabel(key: string, value: unknown): string {
  const options = QUOTE_ANSWER_OPTION_LABELS[normalizeAnswerKey(key)];
  if (typeof value === "string") return options?.[value] ?? value;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined) return "-";
  if (Array.isArray(value)) return value.map((item) => quoteAnswerValueLabel(key, item)).join(", ");
  return JSON.stringify(value);
}
