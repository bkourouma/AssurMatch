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
  lead_quality: "Qualité du lead insuffisante",
  wrong_scope: "Hors périmètre pays ou produit",
  unreachable_prospect: "Prospect injoignable",
  duplicate: "Doublon",
  compliance_concern: "Point de conformité"
};

export const STARTER_STATUS_LABELS: Record<string, string> = {
  assigned: "Assigné",
  broker_notified: "Courtier notifié",
  seen: "Vu",
  accepted: "Accepté",
  rejected: "Rejeté",
  disputed: "Contesté",
  closed: "Clôturé"
};

export const STARTER_EVENT_LABELS: Record<string, string> = {
  assigned: "Lead assigné par le routage",
  reassigned: "Lead réassigné",
  viewed: "Détail consulté et marqué vu",
  accepted: "Lead accepté par le courtier",
  rejected: "Lead rejeté avec motif",
  disputed: "Lead contesté avec motif",
  closed: "Lead clôturé par le courtier",
  notification_read: "Notification lue",
  exported: "Lead exporté",
  blocked: "Action bloquée",
  // Spec 055: boucle de reponse au visiteur.
  proposal_sent: "Proposition envoyée au visiteur",
  proposal_withdrawn: "Proposition retirée",
  visitor_responded: "Réponse du visiteur reçue"
};

/** Statuts terminaux Starter: plus aucune action courtier n'est possible. */
export const STARTER_FINAL_STATUSES = ["closed"] as const;

/**
 * Spec 059 (suite): issue de la cloture d'un lead accepte, comme `brokerStarterCloseOutcomeSchema`.
 * La cloture fait partie du cycle de vie minimal Starter (constitution 1.3.0) ; elle informe le
 * visiteur (e-mail "demande cloturee") sans rien dire de l'issue commerciale.
 */
export const STARTER_CLOSE_OUTCOMES = ["gagne", "perdu", "sans_suite"] as const;
export type StarterCloseOutcome = (typeof STARTER_CLOSE_OUTCOMES)[number];

export const STARTER_CLOSE_OUTCOME_LABELS: Record<StarterCloseOutcome, string> = {
  gagne: "Gagné",
  perdu: "Perdu",
  sans_suite: "Sans suite"
};

/** Statuts Starter a partir desquels le courtier peut cloturer: le lead doit avoir ete accepte. */
/** Statuts d'un lead qui n'a pas encore ete accepte : seuls ceux-la proposent « Accepter ». */
export const STARTER_ACCEPTABLE_STATUSES = ["assigned", "broker_notified", "seen"] as const;

export const STARTER_CLOSABLE_STATUSES = ["accepted", "received", "contacted"] as const;

export function isStarterCloseOutcome(value: string): value is StarterCloseOutcome {
  return (STARTER_CLOSE_OUTCOMES as readonly string[]).includes(value);
}

export function starterCloseOutcomeLabel(value: string | undefined): string {
  return value && isStarterCloseOutcome(value) ? STARTER_CLOSE_OUTCOME_LABELS[value] : value ?? "";
}

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
  accepte: "Accepté",
  contact_tente: "Contact tenté",
  contacte: "Contacté",
  qualifie: "Qualifié",
  documents_demandes: "Documents demandés",
  devis_en_preparation: "Devis en préparation",
  devis_envoye: "Devis envoyé",
  negociation: "Négociation",
  gagne: "Gagné",
  perdu: "Perdu",
  doublon: "Doublon",
  injoignable: "Injoignable",
  hors_cible: "Hors cible",
  rejete_conteste: "Rejeté ou contesté"
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
  wrong_scope: "Hors périmètre pays ou produit",
  out_of_target: "Hors cible commerciale",
  invalid_lead: "Lead invalide",
  client_abandoned: "Abandon du prospect",
  compliance_concern: "Point de conformité"
};

export const CRM_EVENT_LABELS: Record<string, string> = {
  status_changed: "Changement de statut",
  note_created: "Note interne ajoutée",
  task_created: "Tâche commerciale créée",
  reminder_created: "Rappel programmé",
  assigned: "Lead assigné à un conseiller",
  document_added: "Document interne ajouté",
  proposal_added: "Référence de devis ajoutée",
  disputed: "Contestation ouverte",
  exported: "Export réalisé",
  proposal_sent: "Proposition envoyée au visiteur",
  proposal_withdrawn: "Proposition retirée"
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

/** Libellé d'une question du formulaire de devis: la clé de l'API n'est jamais montrée telle quelle. */
export const ANSWER_LABELS: Record<string, string> = {
  usage: "Usage",
  budget: "Budget indicatif",
  vehicle_count: "Nombre de véhicules",
  vehicle_use: "Usage du véhicule",
  contact_preference: "Préférence de contact",
  coverage_extension: "Extension de couverture"
};

export function answerLabel(key: string): string {
  const known = ANSWER_LABELS[key];
  if (known) return known;
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
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
  return CRM_STATUS_LABELS[value as CrmPipelineStatus] ?? STARTER_STATUS_LABELS[value] ?? value; // statut d'affectation hors pipeline CRM (assigned, seen...): libellé Starter partagé
}

export function crmReasonLabel(value?: string | undefined): string {
  if (!value) return "-";
  return CRM_REASON_LABELS[value as CrmOutcomeReason] ?? value;
}

export function crmEventLabel(value?: string | undefined): string {
  if (!value) return "-";
  return CRM_EVENT_LABELS[value] ?? value;
}

/**
 * Spec 063 (CRM-012): contestation d'un lead. Le courtier conteste dans les 30 jours suivant la
 * reception du lead ; la finance AssurMatch tranche (acceptee ou rejetee) avec un motif et, si elle
 * accepte, le lead est credite sur le prochain brouillon ou par un avoir partiel. Aucune prime
 * d'assurance n'est concernee. Les statuts et modes de credit reproduisent
 * `packages/shared/contracts/lead-disputes.contracts.ts`.
 */
export const DISPUTE_WINDOW_DAYS = 30;

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  opened: "Ouverte",
  under_review: "En cours d'examen",
  accepted: "Acceptée",
  rejected: "Rejetée"
};

/** Spec 063: la décision de rejet est définitive sur la plateforme (une contestation par lead, pas d'appel). */
export const DISPUTE_FINAL_DECISION_NOTICE = "La décision de la finance est définitive sur la plateforme : un désaccord éventuel relève du contrat de partenariat.";

export const DISPUTE_CREDIT_MODE_LABELS: Record<string, string> = {
  draft_invoice: "Crédité sur le prochain brouillon de facture",
  pack_credit: "1 lead vous a été restitué dans votre pack",
  credit_note: "Avoir partiel émis",
  none: "Aucun crédit automatique : la finance AssurMatch traite ce cas avec votre cabinet"
};

/** Motif d'une contestation : motif Starter ou motif de sortie CRM selon l'origine. */
export function disputeReasonLabel(value?: string | undefined): string {
  if (!value) return "-";
  return STARTER_REASON_LABELS[value as StarterActionReason] ?? CRM_REASON_LABELS[value as CrmOutcomeReason] ?? value;
}

export function disputeStatusLabel(value?: string | undefined): string {
  if (!value) return "-";
  return DISPUTE_STATUS_LABELS[value] ?? value;
}
