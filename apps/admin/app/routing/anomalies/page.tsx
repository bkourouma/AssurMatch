import { formatDateTime, readRoutingAnomalies } from "../../lib/operations-api";
import { Badge, Button, Card, DataTable, Notice, PageHeader, PageStack, StateMessage, StatStrip } from "../../lib/ui/admin-ui";

/**
 * Spec 056 (H-06): screen of the deterministic routing anomaly detector of spec 049 (rules
 * without eligible partner, stalled assignments, non-routed peaks...). Governed by
 * `ai_routing_anomaly_detection_enabled`; the AI analysis route is not exposed here.
 */
export default async function RoutingAnomaliesPage() {
  const report = await readRoutingAnomalies();
  const data = report.data;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Routage", href: "/routing" }, { label: "Anomalies" }]}
        title="Anomalies de routage"
        description="Detection deterministe des anomalies de routage (spec 049). Aide operationnelle : aucune decision de routage n'est prise automatiquement."
        actions={<Button href="/routing/history" variant="secondary">Historique de routage</Button>}
      />

      {report.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {report.status === "forbidden" ? <StateMessage tone="danger">Anomalies de routage non accessibles pour ce role admin.</StateMessage> : null}
      {report.status === "error" ? <StateMessage tone="danger">Rapport indisponible : {report.error}</StateMessage> : null}

      <StatStrip
        label="Synthese anomalies"
        items={[
          { label: "Anomalies", value: data.totalAnomalies, tone: data.totalAnomalies > 0 ? "warning" : "neutral" },
          { label: "Critiques", value: data.criticalCount, tone: data.criticalCount > 0 ? "danger" : "neutral" },
          { label: "Avertissements", value: data.warningCount, tone: data.warningCount > 0 ? "warning" : "neutral" }
        ]}
      />

      {(data.recommendations ?? []).length > 0 ? (
        <Notice tone="info" title="Recommandations">
          <ul className="bo-list">{(data.recommendations ?? []).map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul>
        </Notice>
      ) : null}

      <Card title="Anomalies detectees" description={`Rapport genere le ${formatDateTime(data.generatedAt)}.`}>
        <DataTable
          columns={[
            { key: "severity", header: "Severite", render: (anomaly) => <Badge tone={anomaly.severity === "critical" ? "danger" : "warning"}>{anomaly.severity}</Badge> },
            { key: "type", header: "Type", render: (anomaly) => <span className="bo-ref">{anomaly.type}</span> },
            { key: "scope", header: "Pays / produit", render: (anomaly) => `${anomaly.country ?? "-"} / ${anomaly.product ?? "-"}` },
            { key: "details", header: "Details", render: (anomaly) => anomaly.details },
            { key: "metric", header: "Mesure", render: (anomaly) => (anomaly.metricValue !== undefined ? `${anomaly.metricValue}${anomaly.metricThreshold !== undefined ? ` / seuil ${anomaly.metricThreshold}` : ""}` : "-") },
            { key: "detected", header: "Detectee le", render: (anomaly) => formatDateTime(anomaly.detectedAt) }
          ]}
          items={data.anomalies}
          getKey={(anomaly) => anomaly.id}
          emptyLabel="Aucune anomalie de routage detectee."
          emptyDescription="Le routage suit ses regles sans ecart sur la fenetre analysee."
          aria-label="Anomalies de routage"
        />
      </Card>
    </PageStack>
  );
}
