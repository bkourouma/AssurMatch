import Link from "next/link";
import { listAdminAiInsights, readAdminAIAssistance } from "../lib/admin-api";
import { requestAdminInsightAction, validateAdminInsightAction } from "../lib/ai-insight-actions";
import { Badge, Button, Card, Cluster, DataTable, DescriptionList, EmptyState, Form, Input, PageHeader, PageStack, Split, Stack, StateMessage } from "../lib/ui/admin-ui";

const INSIGHT_LABELS: Record<string, string> = {
  admin_risk_triage: "Triage des risques de conformité",
  activation_gap_summary: "Écarts d'activation",
  offer_consistency_check: "Cohérence d'une offre",
  offer_summary: "Résumé d'une offre",
  activity_report: "Rapport d'activité",
  suspicious_leads: "Demandes suspectes"
};

/** Display-only labels: analyses requested elsewhere (spec 064: /routing/anomalies), never requestable from this page. */
const DISPLAY_ONLY_LABELS: Record<string, string> = {
  routing_anomaly_analysis: "Analyse des anomalies de routage (demandée depuis Routage > Anomalies)"
};

const NOTICES: Record<string, string> = {
  queued: "Insight IA demande. Rechargez la page dans quelques secondes pour le consulter.",
  validated: "Décision de validation humaine enregistrée et auditée.",
  quota: "Quota quotidien d'assistance IA atteint.",
  disabled: "Assistance IA désactivée par les feature flags.",
  forbidden: "Action refusée: rôle AI Admin requis.",
  error: "Assistance IA temporairement indisponible."
};

export default async function AdminAIAssistancePage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai } = await searchParams;
  const [assistance, insights] = await Promise.all([readAdminAIAssistance(), listAdminAiInsights()]);
  const enabled = assistance.status === "success" && assistance.data.enabled;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Assistance IA" }]}
        title="Assistance IA admin"
        description="Insights IA indicatifs pour prioriser une revue humaine. Aucune décision automatisée, aucune donnée prospect envoyée au modèle."
      />
      {assistance.forbidden ? <StateMessage tone="danger">Accès assistance IA refusé pour ce rôle admin.</StateMessage> : null}
      {assistance.status === "error" ? <StateMessage tone="danger">Assistance IA indisponible: {assistance.error}</StateMessage> : null}
      {ai && NOTICES[ai] ? <StateMessage tone={ai === "queued" || ai === "validated" ? "info" : "warning"}>{NOTICES[ai]}</StateMessage> : null}
      {assistance.status === "success" ? (
        <>
          <Split>
            <Stack>
            <Card
              title="Flags IA par pays et produit"
              description="État et changement des flags IA par pays et par produit, par une voie de conformité auditée (MFA, référence de politique, approbateur, motif)."
            >
              <Link href="/ai-assistance/flags">Ouvrir les flags IA par pays et produit</Link>
            </Card>

            {enabled ? (
              <Card
                title="Demander un insight IA à valider"
                description="Chaque insight est une aide à la priorisation: l'administrateur valide ou écarte, aucune alerte, offre ou activation n'est modifiée automatiquement."
              >
                <Cluster>
                  {Object.entries(INSIGHT_LABELS).filter(([assistType]) => assistance.data.availableAssistTypes.includes(assistType)).map(([assistType, label]) => (
                    <Form key={assistType} action={requestAdminInsightAction}>
                      <input type="hidden" name="assistType" value={assistType} />
                      {assistType === "offer_consistency_check" || assistType === "offer_summary" ? (
                        <Input name="offerId" placeholder="Identifiant de l'offre" aria-label="Identifiant de l'offre" />
                      ) : null}
                      <Button type="submit" variant="secondary">{label}</Button>
                    </Form>
                  ))}
                </Cluster>
              </Card>
            ) : null}

            {insights.status === "success" && insights.data.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title="Aucun insight récent"
                description={enabled ? "Demandez un insight ci-dessus : il apparaîtra ici pour validation humaine." : "L'assistance IA est désactivée : aucun insight ne peut être demande."}
              />
            ) : null}

            {insights.status === "success" && insights.data.length > 0 ? (
              <Card title="Insights récents">
                <ul className="bo-list">
                  {insights.data.map((insight) => (
                    <li key={insight.id}>
                      <Stack>
                        <Cluster>
                          <strong>{INSIGHT_LABELS[insight.assistType] ?? DISPLAY_ONLY_LABELS[insight.assistType] ?? insight.assistType}</strong>
                          <Badge tone={insight.status === "completed" ? "success" : insight.status === "queued" ? "info" : "warning"}>{insight.status}</Badge>
                          {insight.humanValidationStatus !== "not_required" ? <Badge tone={insight.humanValidationStatus === "pending" ? "warning" : "info"}>validation: {insight.humanValidationStatus}</Badge> : null}
                        </Cluster>
                        {insight.status === "completed" && insight.outputText ? <p>{insight.outputText}</p> : null}
                        {insight.status === "refused" ? <p className="bo-description">Insight retenu par les garde-fous ou assistance désactivée ({insight.refusalReason ?? "refus"}).</p> : null}
                        {insight.status === "completed" && insight.humanValidationStatus === "pending" ? (
                          <Cluster>
                            {(["approved", "rejected"] as const).map((decision) => (
                              <Form key={decision} action={validateAdminInsightAction}>
                                <input type="hidden" name="insightId" value={insight.id} />
                                <input type="hidden" name="decision" value={decision} />
                                <Button type="submit" variant="secondary" size="sm">{decision === "approved" ? "Valider l'insight" : "Écarter l'insight"}</Button>
                              </Form>
                            ))}
                          </Cluster>
                        ) : null}
                      </Stack>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            </Stack>

            <Card title="Garde-fous">
              <Cluster>
                <Badge tone={assistance.data.enabled ? "warning" : "disabled"}>Assistance IA : {assistance.data.enabled ? "activée" : "désactivée"}</Badge>
                <Badge tone={assistance.data.modelCall ? "warning" : "disabled"}>Appel à un modèle IA : {assistance.data.modelCall ? "oui" : "non"}</Badge>
                <Badge tone="warning">validation humaine obligatoire</Badge>
                <Badge tone="info">Audit : métadonnées uniquement</Badge>
              </Cluster>
              <p className="bo-description">{assistance.data.message}</p>
              <DescriptionList
                items={[
                  {
                    term: "Types disponibles",
                    value: assistance.data.availableAssistTypes.length > 0 ? (
                      <ul className="bo-list">
                        {assistance.data.availableAssistTypes.map((assistType) => <li key={assistType}><span className="bo-ref">{assistType}</span></li>)}
                      </ul>
                    ) : "Aucun"
                  }
                ]}
              />
              <DataTable
                columns={[
                  { key: "key", header: "Flag", render: (flag) => <span className="bo-ref">{flag.key}</span> },
                  { key: "value", header: "État", render: (flag) => <Badge tone={flag.value ? "warning" : "disabled"}>{flag.value ? "actif" : "désactivé"}</Badge> },
                  { key: "required", header: "Requis", render: (flag) => flag.required ? "oui" : "non" }
                ]}
                items={assistance.data.flags}
                getKey={(flag) => flag.key}
                emptyLabel="Aucun flag IA référence."
                aria-label="Flags de l'assistance IA"
              />
            </Card>
          </Split>
        </>
      ) : null}
    </PageStack>
  );
}
