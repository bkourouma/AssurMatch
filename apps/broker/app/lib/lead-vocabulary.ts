/**
 * Vocabulaire partage des ecrans lead Starter et CRM.
 *
 * Les listes reproduisent exactement les enums du contrat
 * `packages/shared/contracts/quote.contracts.ts` (brokerStarterReasonSchema,
 * brokerCrmPipelineStatusSchema, brokerCrmOutcomeReasonSchema). Le back-office ne
 * propose donc jamais une valeur que l'API refuserait, et la regle metier
 * "motif obligatoire pour un statut de perte" reste alignee avec
 * `brokerCrmStatusUpdateSchema`.
 *
 * Ce module ne porte aucune action serveur: il est importable depuis les pages
 * comme depuis les server actions.
 */

export const STARTER_ACTION_REASONS = ["lead_quality", "wrong_scope", "unreachable_prospect", "duplicate", "compliance_concern"] as const;
export type StarterActionReason = (typeof STARTER_ACTION_REASONS)[number];

export const STARTER_REASON_LABELS: Record<StarterActionReason, string> = {
  lead_quality: "Qualite du lead insuffisante",
  wrong_scope: "Hors perimetre pays ou produit",
  unreachable_prospect: "Prospect injoignable",
  duplicate: "Doublon",
  compliance_concern: "Point de conformite"
};

export const STARTER_STATUS_LABELS: Record<string, string> = {
  assigned: "Assigne",
  broker_notified: "Courtier notifie",
  seen: "Vu",
  accepted: "Accepte",
  rejected: "Rejete",
  disputed: "Conteste",
  closed: "Cloture"
};

export const STARTER_EVENT_LABELS: Record<string, string> = {
  assigned: "Lead assigne par le routage",
  reassigned: "Lead reassigne",
  viewed: "Detail consulte et marque vu",
  accepted: "Lead accepte par le courtier",
  rejected: "Lead rejete avec motif",
  disputed: "Lead conteste avec motif",
  notification_read: "Notification lue",
  exported: "Lead exporte",
  blocked: "Action bloquee"
};

/** Statuts terminaux Starter: plus aucune action courtier n'est possible. */
export const STARTER_FINAL_STATUSES = ["closed"] as const;

export const CRM_PIPELINE_STATUSES = [
  "nouveau",
  "accepte",
  "contact_tente",
  "contacte",
  "qualifie",
  "documents_demandes",
  "devis_en_preparation",
  "devis_envoye",
  "negociation",
  "gagne",
  "perdu",
  "doublon",
  "injoignable",
  "hors_cible",
  "rejete_conteste"
] as const;
export type CrmPipelineStatus = (typeof CRM_PIPELINE_STATUSES)[number];

export const CRM_STATUS_LABELS: Record<CrmPipelineStatus, string> = {
  nouveau: "Nouveau",
  accepte: "Accepte",
  contact_tente: "Contact tente",
  contacte: "Contacte",
  qualifie: "Qualifie",
  documents_demandes: "Documents demandes",
  devis_en_preparation: "Devis en preparation",
  devis_envoye: "Devis envoye",
  negociation: "Negociation",
  gagne: "Gagne",
  perdu: "Perdu",
  doublon: "Doublon",
  injoignable: "Injoignable",
  hors_cible: "Hors cible",
  rejete_conteste: "Rejete ou conteste"
};

/** Statuts de perte ou de contestation: le contrat exige un motif allowliste. */
export const CRM_REASON_REQUIRED_STATUSES = ["perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"] as const;

export function crmStatusRequiresReason(status: string): boolean {
  return (CRM_REASON_REQUIRED_STATUSES as readonly string[]).includes(status);
}

export const CRM_OUTCOME_REASONS = [
  "price",
  "coverage",
  "unreachable",
  "duplicate",
  "wrong_scope",
  "out_of_target",
  "invalid_lead",
  "client_abandoned",
  "compliance_concern"
] as const;
export type CrmOutcomeReason = (typeof CRM_OUTCOME_REASONS)[number];

export const CRM_REASON_LABELS: Record<CrmOutcomeReason, string> = {
  price: "Prix",
  coverage: "Garanties attendues",
  unreachable: "Prospect injoignable",
  duplicate: "Doublon",
  wrong_scope: "Hors perimetre pays ou produit",
  out_of_target: "Hors cible commerciale",
  invalid_lead: "Lead invalide",
  client_abandoned: "Abandon du prospect",
  compliance_concern: "Point de conformite"
};

export const CRM_EVENT_LABELS: Record<string, string> = {
  status_changed: "Changement de statut",
  note_created: "Note interne ajoutee",
  task_created: "Tache commerciale creee",
  reminder_created: "Rappel programme",
  assigned: "Lead assigne a un conseiller",
  document_added: "Document interne ajoute",
  proposal_added: "Reference de devis ajoutee",
  disputed: "Contestation ouverte",
  exported: "Export realise"
};

export function isStarterActionReason(value: string): value is StarterActionReason {
  return (STARTER_ACTION_REASONS as readonly string[]).includes(value);
}

export function isCrmPipelineStatus(value: string): value is CrmPipelineStatus {
  return (CRM_PIPELINE_STATUSES as readonly string[]).includes(value);
}

export function isCrmOutcomeReason(value: string): value is CrmOutcomeReason {
  return (CRM_OUTCOME_REASONS as readonly string[]).includes(value);
}

/** Rend lisible une valeur de reponse consentie sans jamais serialiser un objet brut illisible. */
export function renderAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function starterStatusLabel(value?: string | undefined): string {
  if (!value) return "-";
  return STARTER_STATUS_LABELS[value] ?? value;
}

export function starterReasonLabel(value?: string | undefined): string {
  if (!value) return "-";
  return STARTER_REASON_LABELS[value as StarterActionReason] ?? value;
}

export function starterEventLabel(value?: string | undefined): string {
  if (!value) return "-";
  return STARTER_EVENT_LABELS[value] ?? value;
}

export function crmStatusLabel(value?: string | undefined): string {
  if (!value) return "-";
  return CRM_STATUS_LABELS[value as CrmPipelineStatus] ?? value;
}

export function crmReasonLabel(value?: string | undefined): string {
  if (!value) return "-";
  return CRM_REASON_LABELS[value as CrmOutcomeReason] ?? value;
}

export function crmEventLabel(value?: string | undefined): string {
  if (!value) return "-";
  return CRM_EVENT_LABELS[value] ?? value;
}
