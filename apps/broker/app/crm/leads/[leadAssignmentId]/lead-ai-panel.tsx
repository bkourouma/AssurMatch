import type { BrokerAiInteraction } from "../../../lib/broker-api";
import { requestLeadAiAction, validateLeadAiAction } from "../../../lib/crm-ai-actions";
import { TENANT_SUSPENDED_MESSAGE } from "../../../lib/broker-permissions";
import { Badge, Button, Card, Cluster, Notice, TenantWriteGuard } from "../../../lib/ui/broker-ui";
import styles from "../../../lib/ui/broker-screens.module.css";

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
      title="Assistance IA d'aide a la comprehension"
      description="Suggestions IA a valider: le courtier decide, aucune decision automatique sur le lead, donnees de contact jamais transmises au modele."
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
        <p className={styles.muted}>Aucune suggestion IA pour ce lead. Choisissez une aide ci-dessus : la suggestion apparait ici, a valider ou ecarter.</p>
      ) : (
        <ul className="bo-list">
          {interactions.map((interaction) => (
            <li key={interaction.id} className={styles.entry}>
              <div className={styles.entryHead}>
                <h3 className={styles.entryTitle}>{ASSIST_LABELS[interaction.assistType] ?? interaction.assistType}</h3>
                <Badge tone={statusTone(interaction.status)}>{interaction.status}</Badge>
                {interaction.fallback ? <Badge tone="neutral">mode simplifie</Badge> : null}
                {interaction.humanValidationStatus !== "not_required" ? <Badge tone={interaction.humanValidationStatus === "pending" ? "warning" : "info"}>validation: {interaction.humanValidationStatus}</Badge> : null}
              </div>
              {interaction.status === "completed" && interaction.outputText ? <p className={styles.message}>{interaction.outputText}</p> : null}
              {interaction.status === "refused" ? <p className={styles.muted}>Suggestion retenue par les garde-fous ou assistance desactivee ({interaction.refusalReason ?? "refus"}).</p> : null}
              {interaction.status === "queued" ? <p className={styles.muted}>Suggestion en cours de preparation.</p> : null}
              {interaction.status === "completed" && interaction.humanValidationStatus === "pending" ? (
                <TenantWriteGuard readOnly={readOnly}>
                <Cluster>
                  {(["approved", "rejected"] as const).map((decision) => (
                    <form key={decision} action={validateLeadAiAction}>
                      <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
                      <input type="hidden" name="interactionId" value={interaction.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <Button type="submit" variant="secondary" size="sm">{decision === "approved" ? "Valider la suggestion" : "Ecarter la suggestion"}</Button>
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
