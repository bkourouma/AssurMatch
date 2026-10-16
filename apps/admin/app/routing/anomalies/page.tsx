import { listAdminAiInsights, readAdminAIAssistance } from "../../lib/admin-api";
import { readBackOfficeSession } from "../../lib/backoffice-auth";
import { formatDateTime, readRoutingAnomalies } from "../../lib/operations-api";
import { requestRoutingAnomalyAnalysisAction, validateRoutingAnomalyAnalysisAction } from "../../lib/routing-anomaly-actions";
import { routingAnomalyAiDisabledReason } from "./ai-state";
import { Badge, Button, Card, Cluster, DataTable, Form, Grid, KpiCard, PageHeader, PageStack, Stack, StateMessage } from "../../lib/ui/admin-ui";

/**
 * Spec 056 (H-06): screen of the deterministic routing anomaly detector of spec 049 (rules
 * without eligible partner, stalled assignments, non-routed peaks...). The deterministic report
 * stays the primary content. Spec 064 (FR-004) adds an optional "Analyse IA (assistance)" card
 * below it: governed by `ai_routing_anomaly_detection_enabled`, asynchronous, indicative,
 * aggregates only, validated by a human, and it never applies a routing or lead re-assignment decision.
 * A failing AI read only degrades that card.
 */

const AI_ASSIST_TYPE = "routing_anomaly_analysis";
/** The API requires `ai:*` on top of `routing_rules:read` for the analysis route. */
const AI_ROLES = new Set(["super_admin", "ai_admin"]);

const NOTICES: Record<string, string> = {
  queued: "Analyse IA demandée. Elle est traitée en arrière-plan : rechargez la page dans quelques secondes pour la consulter.",
  validated: "Décision de validation humaine enregistrée et auditée. Aucune règle ni affectation n'a été modifiée.",
  quota: "Quota quotidien d'assistance IA atteint.",
  disabled: "Assistance IA désactivée par les feature flags.",
  forbidden: "Action refusée : rôle AI Admin requis.",
  error: "Assistance IA temporairement indisponible."
};

const INSIGHT_STATUS_LABELS: Record<string, string> = {
  queued: "en cours",
  completed: "terminée",
  refused: "refusée",
  failed: "échec"
};

const VALIDATION_LABELS: Record<string, string> = {
  pending: "en attente",
  approved: "validée",
  rejected: "écartée"
};

export default async function RoutingAnomaliesPage({ searchParams }: { searchParams?: Promise<{ ai?: string }> }) {
  const { ai } = (await searchParams) ?? {};
  const [report, session] = await Promise.all([readRoutingAnomalies(), readBackOfficeSession()]);
  const data = report.data;

  const roleKnown = session.status === "authenticated" || session.status === "mfa_required";
  const roleAllowed = !roleKnown || session.profile.roles.some((role) => AI_ROLES.has(role));
  // Admins without the AI capability never trigger the (audited) AI reads: the card stays disabled.
  const [assistance, insights] = roleAllowed ? await Promise.all([readAdminAIAssistance(), listAdminAiInsights()]) : [undefined, undefined];
  // Single reason shown next to the disabled button; null when the analysis can be requested.
  const disabledReason = routingAnomalyAiDisabledReason({
    roleAllowed,
    forbidden: Boolean(assistance?.forbidden || insights?.forbidden),
    statusRead: assistance?.status === "success",
    enabled: assistance?.status === "success" && assistance.data.enabled,
    availableAssistTypes: assistance?.status === "success" ? assistance.data.availableAssistTypes : []
  });
  const analyses = insights?.status === "success" ? insights.data.filter((insight) => insight.assistType === AI_ASSIST_TYPE) : [];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Routage", href: "/routing" }, { label: "Anomalies" }]}
        kicker="Routage des leads"
        title="Anomalies de routage"
        description="Detection deterministe des anomalies de routage (spec 049), complétée par une analyse IA optionnelle à valider. Aide operationnelle : aucune decision de routage n'est prise automatiquement."
        actions={<Button href="/routing/history" variant="secondary">Historique de routage</Button>}
      />

      {report.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {report.status === "forbidden" ? <StateMessage tone="danger">Anomalies de routage non accessibles pour ce role admin.</StateMessage> : null}
      {report.status === "error" ? <StateMessage tone="danger">Rapport indisponible : {report.error}</StateMessage> : null}

      <Grid columns="kpi" as="section" aria-label="Synthese anomalies">
        <KpiCard label="Anomalies" value={data.totalAnomalies} tone={data.totalAnomalies > 0 ? "warning" : "neutral"} />
        <KpiCard label="Critiques" value={data.criticalCount} tone={data.criticalCount > 0 ? "danger" : "neutral"} />
        <KpiCard label="Avertissements" value={data.warningCount} tone={data.warningCount > 0 ? "warning" : "neutral"} />
      </Grid>

      {(data.recommendations ?? []).length > 0 ? (
        <Card title="Recommandations">
          <ul>{(data.recommendations ?? []).map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul>
        </Card>
      ) : null}

      <Card title="Anomalies detectees" description={`Rapport genere le ${formatDateTime(data.generatedAt)}.`}>
        <DataTable
          columns={[
            { key: "severity", header: "Severite", render: (anomaly) => <Badge tone={anomaly.severity === "critical" ? "danger" : "warning"}>{anomaly.severity}</Badge> },
            { key: "type", header: "Type", render: (anomaly) => <code>{anomaly.type}</code> },
            { key: "scope", header: "Pays / produit", render: (anomaly) => `${anomaly.country ?? "-"} / ${anomaly.product ?? "-"}` },
            { key: "details", header: "Details", render: (anomaly) => anomaly.details },
            { key: "metric", header: "Mesure", render: (anomaly) => (anomaly.metricValue !== undefined ? `${anomaly.metricValue}${anomaly.metricThreshold !== undefined ? ` / seuil ${anomaly.metricThreshold}` : ""}` : "-") },
            { key: "detected", header: "Detectee le", render: (anomaly) => formatDateTime(anomaly.detectedAt) }
          ]}
          items={data.anomalies}
          getKey={(anomaly) => anomaly.id}
          emptyLabel="Aucune anomalie de routage detectee."
          aria-label="Anomalies de routage"
        />
      </Card>

      <Card
        title="Analyse IA (assistance)"
        description="Analyse indicative des anomalies détectées ci-dessus, produite à partir d'agrégats uniquement : aucune donnée prospect n'est envoyée au modèle."
        actions={<Badge tone="info">Assistance IA</Badge>}
      >
        <Stack>
          <p className="bo-description">
            Cette analyse est une aide à la décision : elle est indicative, doit être validée par un humain, et rien n&apos;est appliqué automatiquement.
            Aucune décision de routage ni aucune réaffectation n&apos;est prise à partir de ce texte.
          </p>
          {ai && NOTICES[ai] ? <StateMessage tone={ai === "queued" || ai === "validated" ? "info" : "warning"}>{NOTICES[ai]}</StateMessage> : null}
          <Form action={requestRoutingAnomalyAnalysisAction}>
            <Cluster>
              <Button type="submit" variant="secondary" disabled={disabledReason !== null} title={disabledReason ?? undefined}>Demander une analyse IA</Button>
              {disabledReason ? <span id="routing-anomaly-ai-disabled" role="note" className="bo-description">{disabledReason}</span> : null}
            </Cluster>
          </Form>

          <h3>Analyses récentes</h3>
          {insights?.status === "error" ? <StateMessage tone="warning">Analyses IA indisponibles : {insights.error}. Le rapport déterministe ci-dessus reste valable.</StateMessage> : null}
          {analyses.length === 0 && insights?.status === "success" ? <p className="bo-description">Aucune analyse IA des anomalies de routage pour le moment.</p> : null}
          {analyses.length > 0 ? (
            <ul className="bo-list" aria-label="Analyses IA des anomalies de routage">
              {analyses.map((insight) => (
                <li key={insight.id}>
                  <Stack>
                    <Cluster>
                      <Badge tone="info">Assistance IA</Badge>
                      <Badge tone={insight.status === "completed" ? "success" : insight.status === "queued" ? "info" : "warning"}>{INSIGHT_STATUS_LABELS[insight.status] ?? insight.status}</Badge>
                      {insight.humanValidationStatus !== "not_required" ? (
                        <Badge tone={insight.humanValidationStatus === "pending" ? "warning" : "info"}>validation : {VALIDATION_LABELS[insight.humanValidationStatus] ?? insight.humanValidationStatus}</Badge>
                      ) : null}
                      <span className="bo-description">{formatDateTime(insight.createdAt)}</span>
                    </Cluster>
                    {insight.status === "completed" && insight.outputText ? <p>{insight.outputText}</p> : null}
                    {insight.status === "refused" ? <p className="bo-description">Analyse retenue par les garde-fous ou assistance désactivée ({insight.refusalReason ?? "refus"}).</p> : null}
                    {insight.status === "completed" && insight.humanValidationStatus === "pending" ? (
                      <Cluster>
                        {(["approved", "rejected"] as const).map((decision) => (
                          <Form key={decision} action={validateRoutingAnomalyAnalysisAction}>
                            <input type="hidden" name="insightId" value={insight.id} />
                            <input type="hidden" name="decision" value={decision} />
                            <Button type="submit" variant="secondary" size="sm">{decision === "approved" ? "Valider l'analyse" : "Écarter l'analyse"}</Button>
                          </Form>
                        ))}
                      </Cluster>
                    ) : null}
                  </Stack>
                </li>
              ))}
            </ul>
          ) : null}
        </Stack>
      </Card>
    </PageStack>
  );
}
