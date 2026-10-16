/**
 * Spec 064 (FR-004): pure decision of the "Analyse IA (assistance)" button of /routing/anomalies.
 * The gate is the admin assistance status: `enabled` (at least one assist type runs) and the
 * presence of `routing_anomaly_analysis` in `availableAssistTypes`. The status endpoint does not
 * list `ai_routing_anomaly_detection_enabled` among its `flags`, so the flag is never looked up there.
 */
export const ROUTING_ANOMALY_AI_FLAG = "ai_routing_anomaly_detection_enabled";
export const ROUTING_ANOMALY_ASSIST_TYPE = "routing_anomaly_analysis";

export interface RoutingAnomalyAiInput {
  /** The role may request the analysis (super_admin / ai_admin); unknown when the session cannot be read. */
  roleAllowed: boolean;
  /** A read of the assistance status or of the insights was refused (403). */
  forbidden: boolean;
  /** The assistance status was read successfully. */
  statusRead: boolean;
  enabled: boolean;
  availableAssistTypes: readonly string[];
}

/** Returns the reason to show next to the disabled button, or null when the analysis can be requested. */
export function routingAnomalyAiDisabledReason(input: RoutingAnomalyAiInput): string | null {
  if (!input.roleAllowed || input.forbidden) {
    return "Analyse IA désactivée : le rôle AI Admin (ai:*) est requis en plus de l'accès au routage.";
  }
  if (!input.statusRead) return "Analyse IA désactivée : l'état de l'assistance IA n'a pas pu être lu pour le moment.";
  if (!input.enabled) return "Analyse IA désactivée : l'assistance IA admin est coupée.";
  if (!input.availableAssistTypes.includes(ROUTING_ANOMALY_ASSIST_TYPE)) {
    return `Analyse IA désactivée : le flag ${ROUTING_ANOMALY_AI_FLAG} est coupé.`;
  }
  return null;
}
