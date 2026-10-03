/**
 * Spec 055: vocabulaire de la reponse au visiteur, partage par les fiches Starter et CRM.
 * Les listes reproduisent les enums de `packages/shared/contracts/lead-proposals.ts`.
 * Ce module ne porte aucune action serveur: il est importable depuis les pages, les route handlers
 * et les server actions.
 */

export const PROPOSAL_NON_CONTRACTUAL_NOTICE = "Proposition indicative non contractuelle, à confirmer par le courtier";
export const PROPOSAL_MESSAGE_MAX = 2000;
export const PROPOSAL_GUARANTEES_MAX = 20;
export const PROPOSAL_GUARANTEE_MAX_LENGTH = 160;
export const PROPOSAL_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const PROPOSAL_CURRENCIES = ["XOF", "XAF", "EUR", "USD", "GNF", "CDF", "MAD"] as const;

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  sent: "Envoyee",
  viewed: "Vue par le visiteur",
  responded: "Reponse du visiteur",
  withdrawn: "Retiree",
  expired: "Expiree"
};

export const VISITOR_RESPONSE_LABELS: Record<string, string> = {
  interested: "Interesse : demande a etre rappele",
  declined: "Ne donne pas suite",
  question: "Question du visiteur"
};

export const DECLINE_REASON_LABELS: Record<string, string> = {
  price: "Prix",
  guarantees: "Garanties",
  delay: "Delai",
  already_insured: "Deja assure",
  other: "Autre"
};

export const PROPOSAL_BLOCKER_LABELS: Record<string, string> = {
  not_accepted: "Acceptez d'abord le lead pour pouvoir repondre au visiteur.",
  lead_closed: "Ce lead est cloture : aucune nouvelle proposition n'est possible.",
  consent_withdrawn: "Le visiteur a retire son consentement : aucune proposition ne peut etre envoyee.",
  limit_reached: "10 propositions actives au maximum : retirez-en une avant d'en envoyer une nouvelle."
};

/** Retour affiche apres l'envoi, le retrait ou un refus de l'API (parametre `proposal=`). */
export const PROPOSAL_NOTICES: Record<string, { tone: "info" | "warning" | "danger"; message: string }> = {
  sent: { tone: "info", message: "Proposition envoyee. Le visiteur est prevenu par e-mail et la voit dans son espace de suivi." },
  withdrawn: { tone: "info", message: "Proposition retiree. Elle n'est plus visible du visiteur ; vous pouvez en envoyer une nouvelle." },
  not_accepted: { tone: "warning", message: "Le lead doit etre accepte avant toute proposition." },
  lead_closed: { tone: "warning", message: "Ce lead est cloture : aucune proposition ne peut etre envoyee." },
  consent_withdrawn: { tone: "warning", message: "Le consentement du visiteur n'est plus actif : envoi refuse." },
  limit_reached: { tone: "warning", message: "Limite de 10 propositions actives atteinte pour ce lead." },
  forbidden_wording: { tone: "warning", message: "Envoi refuse : le texte contient une formulation interdite." },
  quarantined: { tone: "danger", message: "Envoi refuse : le fichier n'a pas passe l'antivirus. Il n'a pas ete conserve." },
  document_invalid: { tone: "warning", message: "Fichier refuse : PDF de 5 Mo au maximum uniquement." },
  invalid: { tone: "warning", message: "Saisie refusee : message, prime ou fourchette, devise et date de validite future sont obligatoires." },
  forbidden: { tone: "warning", message: "Action refusee par vos permissions, votre tenant ou votre MFA." },
  suspended: { tone: "warning", message: "Compte suspendu : consultation seule. Contactez AssurMatch." },
  not_found: { tone: "warning", message: "Proposition introuvable pour ce lead." },
  error: { tone: "danger", message: "Envoi indisponible pour le moment. Aucune proposition n'a ete envoyee." }
};

const CODE_OUTCOMES: Record<string, string> = {
  LEAD_NOT_ACCEPTED: "not_accepted",
  LEAD_CLOSED: "lead_closed",
  LEAD_CONSENT_WITHDRAWN: "consent_withdrawn",
  PROPOSAL_LIMIT_REACHED: "limit_reached",
  FORBIDDEN_WORDING: "forbidden_wording",
  DOCUMENT_QUARANTINED: "quarantined",
  DOCUMENT_INVALID: "document_invalid",
  DOCUMENT_STORAGE_NOT_CONFIGURED: "document_invalid",
  PARTNER_SUSPENDED: "suspended",
  PROPOSAL_NOT_ACTIVE: "not_found"
};

/** Traduit la reponse de l'API en cle de `PROPOSAL_NOTICES`. */
export function proposalOutcome(result: { status: number; code?: string | undefined }, success: string): string {
  if (result.status === 200 || result.status === 201) return success;
  if (result.code && CODE_OUTCOMES[result.code]) return CODE_OUTCOMES[result.code]!;
  if (result.status === 403) return "forbidden";
  if (result.status === 404) return "not_found";
  if (result.status === 400 || result.status === 413 || result.status === 422) return "invalid";
  return "error";
}

export type ProposalPayloadResult = { ok: true; payload: Record<string, unknown> } | { ok: false };

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

/**
 * Construit le corps JSON d'une proposition depuis le formulaire du composeur. Une garantie par
 * ligne ; la date de validite (jour) vaut jusqu'a la fin de la journee. Le backend re-valide tout.
 */
export function buildProposalPayload(form: FormData, now: Date = new Date()): ProposalPayloadResult {
  const message = text(form, "message").slice(0, PROPOSAL_MESSAGE_MAX);
  const priceMin = amount(text(form, "priceMin"));
  const priceMax = amount(text(form, "priceMax"));
  const currency = text(form, "currency").toUpperCase() || "XOF";
  const guarantees = text(form, "guarantees").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const validDate = text(form, "validUntil");
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validDate) ? new Date(`${validDate}T23:59:59.000Z`) : undefined;
  if (!message || (priceMin === undefined && priceMax === undefined) || Number.isNaN(priceMin) || Number.isNaN(priceMax)) return { ok: false };
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) return { ok: false };
  if (!/^[A-Z]{3}$/.test(currency) || guarantees.length > PROPOSAL_GUARANTEES_MAX || guarantees.some((item) => item.length > PROPOSAL_GUARANTEE_MAX_LENGTH)) return { ok: false };
  if (!validUntil || validUntil.getTime() <= now.getTime()) return { ok: false };
  return {
    ok: true,
    payload: {
      message,
      ...(priceMin !== undefined ? { priceMin } : {}),
      ...(priceMax !== undefined ? { priceMax } : {}),
      currency,
      guarantees,
      validUntil: validUntil.toISOString()
    }
  };
}

export function formatAmount(value: number | undefined, currency: string): string {
  if (value === undefined) return "";
  return `${new Intl.NumberFormat("fr-FR").format(value)} ${currency}`;
}

export function formatPremium(priceMin: number | undefined, priceMax: number | undefined, currency: string): string {
  if (priceMin !== undefined && priceMax !== undefined && priceMin !== priceMax) return `${formatAmount(priceMin, currency)} a ${formatAmount(priceMax, currency)}`;
  return formatAmount(priceMin ?? priceMax, currency);
}
