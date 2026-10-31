import type { BrokerAiInteraction } from "../../../lib/broker-api";
import { requestLeadAiAction, validateLeadAiAction } from "../../../lib/crm-ai-actions";
import { TENANT_SUSPENDED_MESSAGE } from "../../../lib/broker-permissions";
import { Badge, Button, Card, Cluster, Notice, TenantWriteGuard } from "../../../lib/ui/broker-ui";
import styles from "../../../lib/ui/broker-screens.module.css";

const ASSIST_LABELS: Record<string, string> = {
  lead_summary: "Résumé du lead",
  lead_score: "Score indicatif du lead",
  next_action: "Prochaine action suggérée",
  relaunch_message: "Brouillon de message de relance",
  lead_classification: "Classification indicative",
  duplicate_hint: "Indice de doublon"
};

const NOTICES: Record<string, string> = {
  queued: "Suggestion IA demandée. Rechargez la page dans quelques secondes pour la consulter.",
  validated: "Décision de validation humaine enregistrée et auditée.",
  quota: "Quota quotidien d'assistance IA atteint pour votre cabinet.",
  disabled: "Assistance IA indisponible pour ce lead (flags, pays, produit ou plan).",
  forbidden: "Action IA refusée par vos permissions CRM.",
  suspended: TENANT_SUSPENDED_MESSAGE,
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
export function LeadAiPanel({ leadAssignmentId, enabled, availableAssistTypes, interactions, notice, readOnly = false }: { leadAssignmentId: string; enabled: boolean; availableAssistTypes: string[]; interactions: BrokerAiInteraction[]; notice?: string | undefined; readOnly?: boolean | undefined }) {
  if (!enabled) return null;
  const assistTypes = Object.keys(ASSIST_LABELS).filter((assistType) => availableAssistTypes.includes(assistType));
  if (assistTypes.length === 0) return null;

  return (
    <Card
      title="Assistance IA d'aide à la compréhension"
      description="Suggestions IA à valider: le courtier décide, aucune décision automatique sur le lead, données de contact jamais transmises au modèle."
    >
      {notice && NOTICES[notice] ? <Notice tone={notice === "error" ? "danger" : "info"}>{NOTICES[notice]}</Notice> : null}
      <TenantWriteGuard readOnly={readOnly}>
      <Cluster>
        {assistTypes.map((assistType) => (
          <form key={assistType} action={requestLeadAiAction}>
            <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
            <input type="hidden" name="assistType" value={assistType} />
            <Button type="submit" variant="secondary" size="sm">{ASSIST_LABELS[assistType]}</Button>
          </form>
        ))}
      </Cluster>
      </TenantWriteGuard>
      {interactions.length === 0 ? (
        <p className={styles.muted}>Aucune suggestion IA pour ce lead. Choisissez une aide ci-dessus : la suggestion apparaît ici, à valider ou écarter.</p>
      ) : (
        <ul className="bo-list">
          {interactions.map((interaction) => (
            <li key={interaction.id} className={styles.entry}>
              <div className={styles.entryHead}>
                <h3 className={styles.entryTitle}>{ASSIST_LABELS[interaction.assistType] ?? interaction.assistType}</h3>
                <Badge tone={statusTone(interaction.status)}>{interaction.status}</Badge>
                {interaction.fallback ? <Badge tone="neutral">mode simplifié</Badge> : null}
                {interaction.humanValidationStatus !== "not_required" ? <Badge tone={interaction.humanValidationStatus === "pending" ? "warning" : "info"}>validation: {interaction.humanValidationStatus}</Badge> : null}
              </div>
              {interaction.status === "completed" && interaction.outputText ? <p className={styles.message}>{interaction.outputText}</p> : null}
              {interaction.status === "refused" ? <p className={styles.muted}>Suggestion retenue par les garde-fous ou assistance désactivée ({interaction.refusalReason ?? "refus"}).</p> : null}
              {interaction.status === "queued" ? <p className={styles.muted}>Suggestion en cours de préparation.</p> : null}
              {interaction.status === "completed" && interaction.humanValidationStatus === "pending" ? (
                <TenantWriteGuard readOnly={readOnly}>
                <Cluster>
                  {(["approved", "rejected"] as const).map((decision) => (
                    <form key={decision} action={validateLeadAiAction}>
                      <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
                      <input type="hidden" name="interactionId" value={interaction.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <Button type="submit" variant="secondary" size="sm">{decision === "approved" ? "Valider la suggestion" : "Écarter la suggestion"}</Button>
                    </form>
                  ))}
                </Cluster>
                </TenantWriteGuard>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
