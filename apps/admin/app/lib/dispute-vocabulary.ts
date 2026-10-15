import type { Tone } from "./ui/admin-ui";

/**
 * Spec 063 (CRM-012): French wording of the lead disputes ("contestations") shown in the finance
 * back-office. A dispute is credited as a lead credit or a partial credit note ("avoir"); an
 * insurance premium is never refunded here (AssurMatch collects none).
 *
 * The keys mirror `packages/shared/contracts/lead-disputes.contracts.ts` and the reason enums of
 * `quote.contracts.ts` (Starter reasons and CRM outcome reasons).
 */

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  opened: "Ouverte",
  accepted: "Acceptée",
  rejected: "Rejetée"
};

export const DISPUTE_STATUS_TONES: Record<string, Tone> = {
  opened: "warning",
  accepted: "success",
  rejected: "danger"
};

export const DISPUTE_STATUS_FILTER_OPTIONS = [
  { value: "opened", label: "Ouvertes" },
  { value: "accepted", label: "Acceptées" },
  { value: "rejected", label: "Rejetées" }
];

export const DISPUTE_SOURCE_LABELS: Record<string, string> = {
  starter: "Portail Starter",
  crm: "CRM Pro"
};

const DISPUTE_REASON_LABELS: Record<string, string> = {
  // Starter reasons.
  lead_quality: "Qualité du lead insuffisante",
  wrong_scope: "Hors périmètre pays ou produit",
  unreachable_prospect: "Prospect injoignable",
  duplicate: "Doublon",
  compliance_concern: "Point de conformité",
  // CRM outcome reasons.
  price: "Prix",
  coverage: "Garanties attendues",
  unreachable: "Prospect injoignable",
  out_of_target: "Hors cible commerciale",
  invalid_lead: "Lead invalide",
  client_abandoned: "Abandon du prospect"
};

export function disputeReasonLabel(reason: string | undefined): string {
  if (!reason) return "-";
  return DISPUTE_REASON_LABELS[reason] ?? reason;
}

export const DISPUTE_CREDIT_MODE_LABELS: Record<string, string> = {
  draft_invoice: "Crédité sur le prochain brouillon",
  credit_note: "Avoir partiel émis",
  none: "Aucun crédit automatique : traitement manuel par la finance"
};

export const DISPUTE_DECISION_OPTIONS = [
  { value: "accept", label: "Accepter la contestation", hint: "Le lead est crédité au cabinet (brouillon ou avoir partiel)." },
  { value: "reject", label: "Rejeter la contestation", hint: "Le lead reste facturable. Aucun crédit." }
];

/** Roles allowed to read the decision form: `billing:dispute_decide` of the RBAC matrix. */
export const DISPUTE_DECIDER_ROLES = new Set(["finance_admin", "super_admin"]);

export const DISPUTE_REASON_MIN_LENGTH = 10;
export const DISPUTE_REASON_MAX_LENGTH = 1000;

/** Page size of the disputes tab (the API default is 20). */
export const DISPUTE_PAGE_SIZE = 20;
