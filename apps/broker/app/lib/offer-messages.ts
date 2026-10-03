/**
 * Spec 052: wording and form parsing of the broker offer screens ("Mes offres"). Plain module (no
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
  type OfferVersionStatus
} from "../../../../packages/shared/contracts/offer-content";
import type { OfferContent } from "../../../../packages/shared/contracts/offer-content";
import { TENANT_SUSPENDED_MESSAGE } from "./broker-permissions";

export { OFFER_INDICATIVE_DISCLAIMERS, offerCompleteness };
export type { OfferCompleteness };

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

export const OFFER_TYPE_LABELS: Record<string, string> = {
  indicative: "Offre indicative",
  partner: "Offre partenaire"
};

export const PAYMENT_FLEXIBILITY_LABELS: Record<string, string> = {
  annual: "Annuel",
  semiannual: "Semestriel",
  quarterly: "Trimestriel",
  monthly: "Mensuel"
};

export const OFFER_FIELD_LABELS: Record<string, string> = {
  name: "Nom commercial",
  insurerName: "Assureur porteur",
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

export const OFFER_WITHDRAW_TARGET_LABELS: Record<"pending" | "offer", string> = {
  pending: "Abandonner la version en cours",
  offer: "Retirer l'offre du public"
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
  license_not_valid_for_scope: "Aucune licence valide du courtier pour ce pays et ce produit"
};

export function offerBlockerLabel(blocker: OfferBlocker): string {
  const label = OFFER_BLOCKER_LABELS[blocker.code] ?? blocker.code;
  return blocker.field ? `${label} : ${offerFieldLabel(blocker.field)}` : label;
}

export const OFFER_ERROR_MESSAGES: Record<string, string> = {
  OFFER_SCOPE_NOT_COVERED: "Périmètre non couvert : votre cabinet n'a pas de licence valide et d'autorisations actives pour ce pays et ce produit. Contactez AssurMatch pour étendre votre couverture.",
  OFFER_INCOMPLETE: "Soumission refusée : la complétude minimale n'est pas atteinte. Complétez les champs listés.",
  OFFER_VALIDATION_BLOCKED: "Action refusée : des contrôles bloquants sont listés ci-dessous.",
  OFFER_VERSION_CONFLICT: "Conflit de version : l'offre a été modifiée depuis son chargement. Rechargez la page puis recommencez.",
  OFFER_TRANSITION_INVALID: "Action impossible dans l'état actuel de l'offre (version déjà soumise, aucune version en cours ou offre retirée). Rechargez la page.",
  RBAC_DENIED: "Action réservée au propriétaire et aux managers du cabinet. Les agents et les comptes en lecture seule consultent uniquement.",
  NOT_FOUND: "Offre introuvable.",
  PARTNER_SUSPENDED: TENANT_SUSPENDED_MESSAGE
};

export function offerWriteErrorMessage(result: { status: number; code?: string | undefined; message?: string | undefined; suspended?: boolean | undefined }): string {
  if (result.suspended) return TENANT_SUSPENDED_MESSAGE;
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
  if (result.status === 401 || result.code === "session_required") return "Session expirée : reconnectez-vous puis recommencez.";
  if (result.status === 403) return "Action refusée : droits insuffisants.";
  if (result.status === 404) return OFFER_ERROR_MESSAGES.NOT_FOUND ?? "Offre introuvable.";
  if (result.status === 409) return OFFER_ERROR_MESSAGES.OFFER_TRANSITION_INVALID ?? "Conflit : rechargez la page.";
  if (result.status === 0) return "API indisponible : réessayez dans quelques instants.";
  return `Erreur inattendue de l'API (${result.status}${result.code ? ` ${result.code}` : ""}).`;
}

/* ------------------------------------------------------------------------------- formatting */

/** Name of the published version, else of the version in progress. */
export function offerDisplayName(offer: { publicKey: string; published?: { content: { name: string } } | undefined; pending?: { content: { name: string } } | undefined }): string {
  return offer.published?.content.name ?? offer.pending?.content.name ?? offer.publicKey;
}

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
 * Content of an offer version read from the form. Never any sponsorship key: the broker schema is
 * strict and sponsorship is an admin decision (FR-013, 403 otherwise).
 */
export function offerContentFromForm(formData: FormData): Partial<OfferContent> {
  const content: Partial<OfferContent> = {
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
  if (flexibility && flexibility in PAYMENT_FLEXIBILITY_LABELS) content.paymentFlexibility = flexibility as NonNullable<OfferContent["paymentFlexibility"]>;
  const validFrom = dateInputToIso(text(formData, "validFrom"));
  if (validFrom) content.validFrom = validFrom;
  const validUntil = dateInputToIso(text(formData, "validUntil"), true);
  if (validUntil) content.validUntil = validUntil;
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
