/**
 * Spec 052: wording, role checks and form parsing of the admin offer screens. Plain module (no
 * "use server"): the server actions, the server pages and the client forms all import it, so the
 * live completeness shown in the form and the payload sent to the API come from the same parsing.
 *
 * The API stays the authority: hiding a button here only spares the operator a refusal.
 */
import {
  OFFER_INDICATIVE_DISCLAIMERS,
  offerCompleteness,
  type OfferBlocker,
  type OfferCompleteness,
  type OfferCompletenessField,
  type OfferEffectiveStatus,
  type OfferType,
  type OfferVersionStatus
} from "../../../../packages/shared/contracts/offer-content";
import type { AdminOfferContent, AdminWriteResult } from "./admin-api";
import { adminWriteErrorMessage } from "./catalog-messages";

export { OFFER_INDICATIVE_DISCLAIMERS, offerCompleteness };
export type { OfferCompleteness };

/* ------------------------------------------------------------------------------------- roles */

/** FR-011: validate, reject and suspend are reserved to Compliance Admin and Super Admin. */
export const OFFER_DECISION_ROLES = ["compliance_admin", "super_admin"] as const;
/** R4: creation and versioned update for a partner need `offers:update`. */
export const OFFER_PREPARE_ROLES = ["super_admin", "admin_pays", "content_admin"] as const;

export function canDecideOffer(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((role) => (OFFER_DECISION_ROLES as readonly string[]).includes(role));
}

export function canPrepareOffer(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((role) => (OFFER_PREPARE_ROLES as readonly string[]).includes(role));
}

/** The API accepts a submission from a preparer or from compliance. */
export function canSubmitOffer(roles: readonly string[] | undefined): boolean {
  return canPrepareOffer(roles) || canDecideOffer(roles);
}

/* ------------------------------------------------------------------------------------ labels */

export const OFFER_STATUS_OPTIONS = ["draft", "submitted", "published", "suspended", "withdrawn", "expired"] as const satisfies readonly OfferEffectiveStatus[];

export const OFFER_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "En attente de validation",
  published: "Publiée",
  suspended: "Suspendue",
  withdrawn: "Retirée",
  expired: "Expirée"
};

export const OFFER_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "disabled"> = {
  draft: "neutral",
  submitted: "info",
  published: "success",
  suspended: "danger",
  withdrawn: "disabled",
  expired: "warning"
};

export const OFFER_VERSION_STATUS_LABELS: Record<OfferVersionStatus, string> = {
  draft: "Brouillon",
  submitted: "Soumise",
  published: "Publiée",
  archived: "Archivée",
  withdrawn: "Retirée"
};

export const OFFER_VERSION_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "disabled"> = {
  draft: "neutral",
  submitted: "info",
  published: "success",
  archived: "disabled",
  withdrawn: "disabled"
};

/** Spec 070 (PRD section 13): the four offer types. */
export const OFFER_TYPE_LABELS: Record<string, string> = {
  indicative: "Offre indicative",
  partner: "Offre partenaire",
  insurer: "Offre assureur (validée par un assureur, saisie par l'administration)",
  private: "Offre privée (visible uniquement du courtier, jamais publique ni comparée)"
};

/** Short wording for list cells, badges and kickers. */
export const OFFER_TYPE_SHORT_LABELS: Record<string, string> = {
  indicative: "Offre indicative",
  partner: "Offre partenaire",
  insurer: "Offre assureur",
  private: "Offre privée"
};

export const OFFER_TYPE_OPTIONS = ["indicative", "partner", "insurer", "private"] as const satisfies readonly OfferType[];

/** What each type means for the operator; shown under the type selector. */
export const OFFER_TYPE_DESCRIPTIONS: Record<string, string> = {
  indicative: "Offre indicative publiée au comparateur après validation de la conformité.",
  partner: "Offre d'un courtier partenaire, publiée au comparateur après validation de la conformité.",
  insurer: "Offre validée par un assureur et saisie par l'administration. Choisissez l'assureur dans le référentiel (ou saisissez son nom).",
  private: "Offre réservée au courtier propriétaire : elle n'est jamais affichée au public ni comparée. Le courtier est obligatoire et la sponsorisation est impossible."
};

export const PRIVATE_OFFER_BADGE = "Privée — jamais publique";

export function offerTypeLabel(offerType: string | undefined): string {
  return OFFER_TYPE_SHORT_LABELS[offerType ?? "indicative"] ?? "Offre indicative";
}

export const PAYMENT_FLEXIBILITY_LABELS: Record<string, string> = {
  annual: "Annuel",
  semiannual: "Semestriel",
  quarterly: "Trimestriel",
  monthly: "Mensuel"
};

export const OFFER_FIELD_LABELS: Record<string, string> = {
  name: "Nom commercial",
  insurerName: "Assureur porteur",
  insurerId: "Assureur du référentiel",
  offerType: "Type d'offre",
  shortDescription: "Description",
  guaranteeSummary: "Résumé des garanties",
  guarantees: "Garanties (au moins une)",
  exclusionsSummary: "Exclusions",
  deductibleAmount: "Franchise",
  coverageCeiling: "Plafond",
  requiredDocuments: "Documents requis",
  processingDelayDays: "Délai moyen (jours)",
  indicativePrice: "Prime indicative ou fourchette",
  indicativePriceMin: "Prime minimale",
  indicativePriceMax: "Prime maximale",
  currency: "Devise",
  pricingUnit: "Unité de prix",
  validFrom: "Début de validité",
  validUntil: "Fin de validité (future)",
  validity: "Période de validité",
  sourceOfInformation: "Source de l'information",
  publicDisclaimers: "Mentions indicatives",
  guaranteeLevel: "Niveau de garantie",
  paymentFlexibility: "Fractionnement du paiement",
  isSponsored: "Sponsorisée",
  sponsorLabel: "Étiquette de sponsorisation",
  displayPriority: "Priorité d'affichage",
  partnerTenantId: "Courtier"
};

export function offerFieldLabel(field: string): string {
  return OFFER_FIELD_LABELS[field] ?? field;
}

/** French wording of the `{ code, field? }` blockers of 422 offer refusals. */
export const OFFER_BLOCKER_LABELS: Record<string, string> = {
  missing_field: "Champ obligatoire manquant",
  offer_expired: "Offre expirée : la date de fin de validité est passée",
  dates_invalid: "Dates incohérentes : la fin doit être postérieure au début",
  indicative_disclaimer_missing: "Mention « offre indicative » absente",
  price_range_invalid: "Fourchette de prix invalide : le minimum dépasse le maximum",
  partner_missing: "Aucun courtier rattaché à l'offre",
  partner_not_active: "Courtier non actif",
  partner_capacity_blocked: "Capacité du courtier bloquée ou pleine",
  partner_country_not_authorized: "Courtier non autorisé pour ce pays",
  partner_product_not_authorized: "Courtier non autorisé pour ce produit",
  license_not_valid_for_scope: "Aucune licence valide du courtier pour ce pays et ce produit",
  private_offer_not_sponsorable: "Une offre privée ne peut pas être sponsorisée",
  insurer_missing: "Offre assureur : choisissez l'assureur (référentiel) ou saisissez son nom",
  insurer_not_found: "Assureur introuvable dans le référentiel",
  insurer_not_active: "Assureur suspendu ou retiré : il ne peut plus porter de nouvelle offre",
  insurer_country_mismatch: "L'assureur choisi appartient à un autre pays que l'offre"
};

export function offerBlockerLabel(blocker: OfferBlocker): string {
  const label = OFFER_BLOCKER_LABELS[blocker.code] ?? blocker.code;
  return blocker.field ? `${label} : ${offerFieldLabel(blocker.field)}` : label;
}

export const OFFER_ERROR_MESSAGES: Record<string, string> = {
  OFFER_SCOPE_NOT_COVERED: "Périmètre non couvert : le courtier n'a pas de licence valide et d'autorisations actives pour ce pays et ce produit.",
  OFFER_INCOMPLETE: "Soumission refusée : la complétude minimale n'est pas atteinte. Complétez les champs listés.",
  OFFER_VALIDATION_BLOCKED: "Validation refusée : des contrôles bloquants sont listés ci-dessous.",
  OFFER_VERSION_CONFLICT: "Conflit de version : l'offre a été modifiée depuis son chargement. Rechargez la page puis recommencez.",
  OFFER_TRANSITION_INVALID: "Action impossible dans l'état actuel de l'offre (aucune version soumise, déjà décidée ou retirée). Rechargez la page.",
  RBAC_DENIED: "Action refusée : droits insuffisants ou hors périmètre pays.",
  NOT_FOUND: "Offre introuvable ou hors périmètre.",
  PARTNER_SUSPENDED: "Courtier suspendu : aucune écriture n'est possible sur ses offres.",
  OFFER_TYPE_INVALID: "Type d'offre : les règles de ce type ne sont pas respectées (offre privée : courtier obligatoire et pas de sponsorisation ; offre assureur : assureur obligatoire). Voir la liste ci-dessous.",
  OFFER_TYPE_IMMUTABLE: "Le type d'une offre ne peut pas changer après sa création. Créez une nouvelle offre du type voulu.",
  OFFER_INSURER_INVALID: "Assureur refusé : il est introuvable, suspendu ou rattaché à un autre pays que l'offre. Choisissez un assureur actif du pays de l'offre ou saisissez son nom."
};

export function offerWriteErrorMessage(result: Pick<AdminWriteResult<unknown>, "status" | "code" | "message">): string {
  const message = result.code ? OFFER_ERROR_MESSAGES[result.code] : undefined;
  if (message) return message;
  const forbidden = result.message?.match(/Forbidden regulated wording:\s*([^;]+)/i);
  if (result.status === 400 && forbidden) return `Formulation réglementée interdite détectée : « ${forbidden[1]?.trim()} ». Reformulez le champ concerné.`;
  if (result.status === 400 && result.message && /indicativePriceMin must not exceed/i.test(result.message)) {
    return "Prix invalide : la prime minimale dépasse la prime maximale.";
  }
  if (result.status === 400 && result.message && /validUntil must be after validFrom/i.test(result.message)) {
    return "Dates incohérentes : la fin de validité doit être postérieure au début.";
  }
  if (result.status === 400) {
    return "Données invalides : vérifiez les champs (dates, prix minimal inférieur au maximal, 50 garanties au plus, motif de 8 caractères au moins).";
  }
  return adminWriteErrorMessage(result);
}

/* ------------------------------------------------------------------------------- formatting */

export function offerFormatDate(value?: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}

export function formatPriceRange(min?: number, max?: number, currency = "XOF", unit?: string): string {
  if (min === undefined && max === undefined) return "-";
  const format = (value: number) => value.toLocaleString("fr-FR");
  const range = min !== undefined && max !== undefined && min !== max
    ? `${format(min)} - ${format(max)}`
    : format((min ?? max) as number);
  return `${range} ${currency}${unit ? ` / ${unit}` : ""}`;
}

export function formatDiffValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value
      .map((entry) => {
        if (entry && typeof entry === "object" && "label" in entry) {
          const guarantee = entry as { label: string; included?: boolean; detail?: string };
          return `${guarantee.label}${guarantee.included === false ? " (non incluse)" : ""}${guarantee.detail ? ` : ${guarantee.detail}` : ""}`;
        }
        return String(entry);
      })
      .join(" ; ");
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return offerFormatDate(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* -------------------------------------------------------------------------------- form data */

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = text(formData, name);
  return value ? value : undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalNumber(formData: FormData, name: string): number | undefined {
  const raw = text(formData, name).replace(/\s/g, "").replace(",", ".");
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function optionalInt(formData: FormData, name: string): number | undefined {
  const value = optionalNumber(formData, name);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

function lines(formData: FormData, name: string): string[] {
  return text(formData, name)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** `YYYY-MM-DD` of a date input to the ISO date-time the API expects (start or end of day, UTC). */
export function dateInputToIso(value: string, endOfDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return `${value}T${endOfDay ? "23:59:59.000" : "00:00:00.000"}Z`;
}

export function isoToDateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export interface OfferGuaranteeRow {
  key: string;
  label: string;
  included: boolean;
  detail?: string;
}

function guarantees(formData: FormData): OfferGuaranteeRow[] {
  const keys = formData.getAll("guaranteeKey");
  const labels = formData.getAll("guaranteeLabel");
  const included = formData.getAll("guaranteeIncluded");
  const details = formData.getAll("guaranteeDetail");
  const rows: OfferGuaranteeRow[] = [];
  labels.forEach((rawLabel, index) => {
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    if (!label) return;
    const rawKey = keys[index];
    const key = (typeof rawKey === "string" && rawKey.trim()) ? rawKey.trim() : slugify(label);
    const detail = details[index];
    rows.push({
      key,
      label,
      included: included[index] !== "false",
      ...(typeof detail === "string" && detail.trim() ? { detail: detail.trim() } : {})
    });
  });
  return rows;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "garantie";
}

/**
 * Content of an offer version read from the shared form. `sponsorship` is true only on the admin
 * forms (FR-013): sponsorship is an admin decision, validated like any other version.
 */
export function offerContentFromForm(formData: FormData): Partial<AdminOfferContent> {
  const content: Partial<AdminOfferContent> = {
    name: text(formData, "name"),
    currency: text(formData, "currency").toUpperCase() || "XOF",
    guarantees: guarantees(formData),
    requiredDocuments: lines(formData, "requiredDocuments"),
    publicDisclaimers: lines(formData, "publicDisclaimers")
  };
  const textKeys = ["shortDescription", "guaranteeSummary", "insurerName", "exclusionsSummary", "pricingUnit", "sourceOfInformation"] as const;
  for (const key of textKeys) {
    const value = optionalText(formData, key);
    if (value !== undefined) content[key] = value;
  }
  // Spec 070: a chosen insurer of the referential (the API then sets the displayed name itself).
  const insurerId = optionalText(formData, "insurerId");
  if (insurerId !== undefined && UUID_PATTERN.test(insurerId)) content.insurerId = insurerId;
  const numberKeys = ["indicativePriceMin", "indicativePriceMax", "deductibleAmount", "coverageCeiling"] as const;
  for (const key of numberKeys) {
    const value = optionalNumber(formData, key);
    if (value !== undefined) content[key] = value;
  }
  const delay = optionalInt(formData, "processingDelayDays");
  if (delay !== undefined) content.processingDelayDays = delay;
  const level = optionalInt(formData, "guaranteeLevel");
  if (level !== undefined) content.guaranteeLevel = level;
  const flexibility = optionalText(formData, "paymentFlexibility");
  if (flexibility && flexibility in PAYMENT_FLEXIBILITY_LABELS) content.paymentFlexibility = flexibility as NonNullable<AdminOfferContent["paymentFlexibility"]>;
  const validFrom = dateInputToIso(text(formData, "validFrom"));
  if (validFrom) content.validFrom = validFrom;
  const validUntil = dateInputToIso(text(formData, "validUntil"), true);
  if (validUntil) content.validUntil = validUntil;
  if (formData.has("sponsorshipFields")) {
    content.isSponsored = formData.get("isSponsored") === "on" || formData.get("isSponsored") === "true";
    const label = optionalText(formData, "sponsorLabel");
    if (label !== undefined) content.sponsorLabel = label;
    const priority = optionalInt(formData, "displayPriority");
    if (priority !== undefined) content.displayPriority = priority;
  }
  return content;
}

/** Completeness labels of the live checklist (FR-004). */
export const COMPLETENESS_CHECKLIST: Array<{ field: OfferCompletenessField; label: string }> = [
  { field: "name", label: "Nom commercial" },
  { field: "insurerName", label: "Assureur porteur" },
  { field: "guarantees", label: "Au moins une garantie" },
  { field: "indicativePrice", label: "Prime indicative ou fourchette" },
  { field: "validUntil", label: "Fin de validité future" },
  { field: "sourceOfInformation", label: "Source de l'information" }
];

/* ----------------------------------------------------------------- insurers (spec 070) */

export const INSURER_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  suspended: "Suspendu",
  retired: "Retiré"
};

export const INSURER_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "disabled"> = {
  active: "success",
  suspended: "warning",
  retired: "disabled"
};

export const INSURER_STATUS_OPTIONS = ["active", "suspended", "retired"] as const;

/** Edit form: a retired insurer is retired through the dedicated action, with a reason. */
export const INSURER_EDIT_STATUS_OPTIONS = ["active", "suspended"] as const;

export const INSURER_STATUS_HINT = "Un assureur suspendu ou retiré ne peut plus être choisi pour une nouvelle offre ; les offres existantes gardent son nom.";

export function insurerWriteErrorMessage(
  result: { status: number; code?: string | undefined; message?: string | undefined },
  operation: "create" | "update" | "retire"
): string {
  if (result.status === 401 || result.code === "session_required") return "Session expirée : reconnectez-vous puis recommencez.";
  if (result.status === 403) return "Action refusée : droits insuffisants ou hors périmètre pays.";
  if (result.status === 404) return "Assureur introuvable ou hors de votre périmètre.";
  if (result.status === 409) {
    return operation === "create"
      ? "Ce code existe déjà pour ce pays : choisissez un autre code (le couple pays + code est unique)."
      : "Conflit : la fiche a été modifiée depuis son chargement. Rechargez la page puis recommencez.";
  }
  const forbidden = result.message?.match(/Forbidden regulated wording:\s*([^;]+)/i);
  if (result.status === 400 && forbidden) return `Formulation réglementée interdite détectée : « ${forbidden[1]?.trim()} ». Reformulez le champ concerné.`;
  if (result.status === 400 || result.status === 422) {
    return "Données invalides : vérifiez le nom, le code (minuscules, chiffres et tirets) et le motif (8 caractères au moins).";
  }
  if (result.status === 0) return "API indisponible : réessayez dans quelques instants.";
  return `Erreur inattendue de l'API (${result.status}${result.code ? ` ${result.code}` : ""}).`;
}

/* --------------------------------------------------------------- AI summary (OFFER-010) */

export const OFFER_AI_SUMMARY_TITLE = "Résumé IA";
export const OFFER_AI_DISABLED_NOTE = "Assistance IA désactivée pour cette offre";
export const OFFER_AI_NO_SUMMARY_NOTE = "Aucun résumé validé";

export const OFFER_AI_SUMMARY_NOTICES: Record<string, string> = {
  queued: "Résumé IA demandé. Rechargez la page dans quelques secondes, puis validez-le depuis l'assistance IA pour le rendre visible.",
  quota: "Quota quotidien d'assistance IA atteint.",
  disabled: "Assistance IA désactivée pour cette offre.",
  forbidden: "Action refusée : rôle AI Admin requis.",
  error: "Assistance IA temporairement indisponible."
};
