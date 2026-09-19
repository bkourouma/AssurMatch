import type { BrokerAiInteraction } from "../../../lib/broker-api";
import { requestLeadAiAction, validateLeadAiAction } from "../../../lib/crm-ai-actions";
import { Badge, Card } from "../../../lib/ui/broker-ui";

const ASSIST_LABELS: Record<string, string> = {
  lead_summary: "Resume du lead",
  lead_score: "Score indicatif du lead",
  next_action: "Prochaine action suggeree",
  relaunch_message: "Brouillon de message de relance",
  lead_classification: "Classification indicative",
  duplicate_hint: "Indice de doublon"
};

const NOTICES: Record<string, string> = {
  queued: "Suggestion IA demandee. Rechargez la page dans quelques secondes pour la consulter.",
  validated: "Decision de validation humaine enregistree et auditee.",
  quota: "Quota quotidien d'assistance IA atteint pour votre cabinet.",
  disabled: "Assistance IA indisponible pour ce lead (flags, pays, produit ou plan).",
  forbidden: "Action IA refusee par vos permissions CRM.",
  error: "Assistance IA temporairement indisponible."
};

function statusTone(status: BrokerAiInteraction["status"]): "success" | "warning" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "refused" || status === "failed") return "warning";
  return "info";
}

/**
 * Broker AI panel: rendered only when the tenant's assistance status is enabled. Every output is a
 * suggestion to validate; the broker decides, nothing changes the lead automatically.
 */
export function LeadAiPanel({ leadAssignmentId, enabled, availableAssistTypes, interactions, notice }: { leadAssignmentId: string; enabled: boolean; availableAssistTypes: string[]; interactions: BrokerAiInteraction[]; notice?: string | undefined }) {
  if (!enabled) return null;
  const assistTypes = Object.keys(ASSIST_LABELS).filter((assistType) => availableAssistTypes.includes(assistType));
  if (assistTypes.length === 0) return null;

  return (
    <Card plain>
      <h2 className="section-title">Assistance IA d'aide a la comprehension</h2>
      <p className="page-description">
        Suggestions IA a valider: le courtier decide, aucune decision automatique sur le lead, donnees de contact jamais transmises au modele.
      </p>
      {notice && NOTICES[notice] ? <p role="status">{NOTICES[notice]}</p> : null}
      <div className="inline-cluster">
        {assistTypes.map((assistType) => (
          <form key={assistType} action={requestLeadAiAction}>
            <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
            <input type="hidden" name="assistType" value={assistType} />
            <button type="submit" className="button button--secondary">{ASSIST_LABELS[assistType]}</button>
          </form>
        ))}
      </div>
      {interactions.length === 0 ? (
        <p className="page-description">Aucune suggestion IA pour ce lead.</p>
      ) : (
        <ul className="simple-list">
          {interactions.map((interaction) => (
            <li key={interaction.id}>
              <div className="inline-cluster">
                <strong>{ASSIST_LABELS[interaction.assistType] ?? interaction.assistType}</strong>
                <Badge tone={statusTone(interaction.status)}>{interaction.status}</Badge>
                {interaction.fallback ? <Badge tone="neutral">mode simplifie</Badge> : null}
                {interaction.humanValidationStatus !== "not_required" ? <Badge tone={interaction.humanValidationStatus === "pending" ? "warning" : "info"}>validation: {interaction.humanValidationStatus}</Badge> : null}
              </div>
              {interaction.status === "completed" && interaction.outputText ? <p>{interaction.outputText}</p> : null}
              {interaction.status === "refused" ? <p className="page-description">Suggestion retenue par les garde-fous ou assistance desactivee ({interaction.refusalReason ?? "refus"}).</p> : null}
              {interaction.status === "queued" ? <p className="page-description">Suggestion en cours de preparation.</p> : null}
              {interaction.status === "completed" && interaction.humanValidationStatus === "pending" ? (
                <div className="inline-cluster">
                  {(["approved", "rejected"] as const).map((decision) => (
                    <form key={decision} action={validateLeadAiAction}>
                      <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
                      <input type="hidden" name="interactionId" value={interaction.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <button type="submit" className="button button--secondary">{decision === "approved" ? "Valider la suggestion" : "Ecarter la suggestion"}</button>
                    </form>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
