import type { BrokerDashboardData } from "../broker-api";
import { CRM_SOURCE_LABELS } from "../crm-list-query";
import { Card, DataTable, Notice, StatStrip } from "./broker-ui";
import { LEAD_COST_NOTICE, crmPerformanceKpis, crmTopSources, formatCount, formatRate } from "./broker-view-models";

/**
 * Lot 3 (spec 069 FR-001, PRD §20): indicateurs de performance commerciale du tableau de bord courtier.
 * Ils viennent de la section `crm` de `GET /broker/dashboard`, absente pour le Starter : le composant
 * ne rend alors rien. La conversion est « Gagnés / reçus » ; le coût par lead est une estimation.
 */
export function CrmKpiSection({ data }: { data: BrokerDashboardData }) {
  const cards = crmPerformanceKpis(data);
  if (cards.length === 0) return null;
  const sources = crmTopSources(data);
  const hasCost = Boolean(data.crm?.kpis?.leadCost);

  return (
    <>
      <section aria-label="Indicateurs de performance commerciale">
        <StatStrip items={cards.map((card) => ({ label: card.label, value: card.value, helper: card.helper, tone: card.tone }))} label="Indicateurs de performance commerciale" />
        {hasCost ? <Notice tone="info">{LEAD_COST_NOTICE}</Notice> : null}
      </section>

      {sources.length > 0 ? (
        <Card title="Sources performantes" description="Source de la demande enregistrée sur le lead (aucune donnée de campagne marketing n'est collectée).">
          <DataTable
            columns={[
              { key: "source", header: "Source", render: (row) => CRM_SOURCE_LABELS[row.source] ?? row.source },
              { key: "received", header: "Reçus", numeric: true, align: "right", render: (row) => formatCount(row.received) },
              { key: "won", header: "Gagnés", numeric: true, align: "right", render: (row) => formatCount(row.won) },
              { key: "rate", header: "Gagnés / reçus", numeric: true, align: "right", render: (row) => formatRate(row.conversionRate) }
            ]}
            items={sources}
            getKey={(row) => row.source}
            aria-label="Sources performantes"
            emptyLabel="Aucune source mesurée."
            dense
          />
        </Card>
      ) : null}
    </>
  );
}
