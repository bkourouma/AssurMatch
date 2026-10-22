/**
 * Lot 5 (spec 071): French wording of the routing queue (parked reasons, AI suggestion) and of the
 * new candidate exclusion reasons. Pure module so the static specs can read it directly.
 */

export const PARKED_REASON_LABELS: Record<string, string> = {
  manual_rule: "Règle manuelle",
  lead_quality_below_threshold: "Qualité du lead sous le seuil (revue manuelle)",
  ai_suggestion_pending: "Suggestion IA à valider",
  ai_assisted_routing_disabled: "IA assistée désactivée: affectation manuelle"
};

export function parkedReasonLabel(reason: string): string {
  return PARKED_REASON_LABELS[reason] ?? reason;
}

/** Reasons that exclude a candidate (or degrade its ranking) in the deterministic eligibility checks. */
export const CANDIDATE_REASON_LABELS: Record<string, string> = {
  subscription_inactive: "Abonnement suspendu ou résilié",
  contract_missing: "Aucun contrat enregistré",
  contract_expired: "Contrat expiré",
  sla_overrun: "Délai de réponse dépassé (classement dégradé)"
};

/** Unknown (older) reasons keep their raw value. */
export function candidateReasonLabel(reason: string): string {
  return CANDIDATE_REASON_LABELS[reason] ?? reason;
}

export const AI_ASSISTED_MODE_LABEL = "IA assistée (suggestion à valider)";

export const AI_ASSISTED_MODE_NOTE =
  "L'IA ne fait que suggérer un courtier parmi les courtiers éligibles; l'affectation reste une décision humaine. Désactivé par défaut (drapeau ai_assisted_routing_enabled).";

export function qualityScoreLabel(score: number): string {
  return `Qualité du lead : ${score}/100`;
}
