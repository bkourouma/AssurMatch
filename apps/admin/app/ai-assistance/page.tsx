import { listAdminAiInsights, readAdminAIAssistance } from "../lib/admin-api";
import { requestAdminInsightAction, validateAdminInsightAction } from "../lib/ai-insight-actions";
import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";

const INSIGHT_LABELS: Record<string, string> = {
  admin_risk_triage: "Triage des risques de conformite",
  activation_gap_summary: "Ecarts d'activation",
  offer_consistency_check: "Coherence d'une offre",
  activity_report: "Rapport d'activite",
  suspicious_leads: "Demandes suspectes"
};

const NOTICES: Record<string, string> = {
  queued: "Insight IA demande. Rechargez la page dans quelques secondes pour le consulter.",
  validated: "Decision de validation humaine enregistree et auditee.",
  quota: "Quota quotidien d'assistance IA atteint.",
  disabled: "Assistance IA desactivee par les feature flags.",
  forbidden: "Action refusee: role AI Admin requis.",
  error: "Assistance IA temporairement indisponible."
};

export default async function AdminAIAssistancePage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai } = await searchParams;
  const [assistance, insights] = await Promise.all([readAdminAIAssistance(), listAdminAiInsights()]);
  const enabled = assistance.status === "success" && assistance.data.enabled;

  return (
    <div className="page-stack">
      <PageHeader
        kicker="IA controlee"
        title="Assistance IA admin"
        description="Insights IA indicatifs pour prioriser une revue humaine. Aucune decision automatisee, aucune donnee prospect envoyee au modele."
      />
      {assistance.forbidden ? <StateMessage tone="danger">Acces assistance IA refuse pour ce role admin.</StateMessage> : null}
      {assistance.status === "error" ? <StateMessage tone="danger">Assistance IA indisponible: {assistance.error}</StateMessage> : null}
      {ai && NOTICES[ai] ? <StateMessage tone={ai === "queued" || ai === "validated" ? "info" : "warning"}>{NOTICES[ai]}</StateMessage> : null}
      {assistance.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--two">
            <Card>
              <h2 className="section-title">Garde-fous</h2>
              <div className="admin-grid">
                <Badge tone={assistance.data.enabled ? "warning" : "disabled"}>enabled: {String(assistance.data.enabled)}</Badge>
                <Badge tone={assistance.data.modelCall ? "warning" : "disabled"}>modelCall: {String(assistance.data.modelCall)}</Badge>
                <Badge tone="warning">validation humaine obligatoire</Badge>
                <Badge tone="info">audit metadata_only</Badge>
              </div>
            </Card>
            <Card>
              <h2 className="section-title">Types disponibles</h2>
              <ul className="simple-list">
                {assistance.data.availableAssistTypes.map((assistType) => <li key={assistType}>{assistType}</li>)}
              </ul>
            </Card>
          </section>

          {enabled ? (
            <Card>
              <h2 className="section-title">Demander un insight IA a valider</h2>
              <p className="page-description">
                Chaque insight est une aide a la priorisation: l'administrateur valide ou ecarte, aucune alerte, offre ou activation n'est modifiee automatiquement.
              </p>
              <div className="admin-grid">
                {Object.entries(INSIGHT_LABELS).filter(([assistType]) => assistance.data.availableAssistTypes.includes(assistType)).map(([assistType, label]) => (
                  <form key={assistType} action={requestAdminInsightAction}>
                    <input type="hidden" name="assistType" value={assistType} />
                    {assistType === "offer_consistency_check" ? <input name="offerId" placeholder="Identifiant de l'offre" aria-label="Identifiant de l'offre" /> : null}
                    <button type="submit" className="button button--secondary">{label}</button>
                  </form>
                ))}
              </div>
            </Card>
          ) : null}

          {insights.status === "success" && insights.data.length > 0 ? (
            <Card>
              <h2 className="section-title">Insights recents</h2>
              <ul className="simple-list">
                {insights.data.map((insight) => (
                  <li key={insight.id}>
                    <div className="admin-grid">
                      <strong>{INSIGHT_LABELS[insight.assistType] ?? insight.assistType}</strong>
                      <Badge tone={insight.status === "completed" ? "success" : insight.status === "queued" ? "info" : "warning"}>{insight.status}</Badge>
                      {insight.humanValidationStatus !== "not_required" ? <Badge tone={insight.humanValidationStatus === "pending" ? "warning" : "info"}>validation: {insight.humanValidationStatus}</Badge> : null}
                    </div>
                    {insight.status === "completed" && insight.outputText ? <p>{insight.outputText}</p> : null}
                    {insight.status === "refused" ? <p className="page-description">Insight retenu par les garde-fous ou assistance desactivee ({insight.refusalReason ?? "refus"}).</p> : null}
                    {insight.status === "completed" && insight.humanValidationStatus === "pending" ? (
                      <div className="admin-grid">
                        {(["approved", "rejected"] as const).map((decision) => (
                          <form key={decision} action={validateAdminInsightAction}>
                            <input type="hidden" name="insightId" value={insight.id} />
                            <input type="hidden" name="decision" value={decision} />
                            <button type="submit" className="button button--secondary">{decision === "approved" ? "Valider l'insight" : "Ecarter l'insight"}</button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <DataTable
              columns={[
                { header: "Flag", render: (flag) => <code>{flag.key}</code> },
                { header: "Etat", render: (flag) => <Badge tone={flag.value ? "warning" : "disabled"}>{flag.value ? "actif" : "desactive"}</Badge> },
                { header: "Requis", render: (flag) => flag.required ? "oui" : "non" }
              ]}
              items={assistance.data.flags}
              getKey={(flag) => flag.key}
              emptyLabel="Aucun flag IA reference."
            />
          </Card>
          <StateMessage tone="warning">{assistance.data.message}</StateMessage>
        </>
      ) : null}
    </div>
  );
}
