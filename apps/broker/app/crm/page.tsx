import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerAIAssistance, readBrokerAdvisors, readBrokerAiOptOut, readBrokerBillingStatement, readBrokerDashboardWithComparison } from "../lib/broker-api";
import { setAiOptOutAction } from "../lib/crm-ai-actions";
import { crmStatusLabel } from "../lib/lead-vocabulary";
import {
  Badge,
  Button,
  Card,
  Cluster,
  DataTable,
  Grid,
  KpiCard,
  Notice,
  PageHeader,
  PageStack,
  Split
} from "../lib/ui/broker-ui";
import { crmKpis, dashboardKpis } from "../lib/ui/broker-view-models";

const BREADCRUMB = [{ label: "CRM" }, { label: "Pipeline" }];

export default async function BrokerCrmPage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai: aiNotice } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status !== "authenticated") {
    if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm", session.error ?? "session_required"));
    if (session.status === "mfa_required") redirect(loginRedirect("/crm", "mfa_required"));
    if (session.status === "forbidden") {
      return (
        <PageStack>
          <PageHeader
            breadcrumb={BREADCRUMB}
            kicker="CRM"
            title="Acces CRM refuse"
            description="Le CRM courtier exige un courtier authentifie, la MFA verifiee et les permissions CRM."
          />
        </PageStack>
      );
    }

    return <Notice tone="warning">CRM indisponible: {session.error ?? "erreur inconnue"}.</Notice>;
  }
  if (isStarterCrmDenied(session.profile)) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="CRM"
          title="CRM complet indisponible"
          description="Le portail Starter reste centre sur les leads recus et leurs actions autorisees."
          actions={<Badge tone="disabled">Module indisponible</Badge>}
        />
        <Notice tone="info" title="Plan Starter">
          Le CRM complet est disponible avec le plan Pro.
        </Notice>
      </PageStack>
    );
  }

  const dashboard = await readBrokerDashboardWithComparison();
  const advisors = await readBrokerAdvisors();
  const [aiAssistance, aiOptOut, statement] = await Promise.all([readBrokerAIAssistance(), readBrokerAiOptOut(), readBrokerBillingStatement()]);
  if (dashboard.unauthenticated) redirect(loginRedirect("/crm", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="CRM"
          title="Acces dashboard refuse"
          description="Le dashboard courtier exige un courtier authentifie, la MFA verifiee et le flag broker_dashboard_enabled actif."
        />
      </PageStack>
    );
  }
  if (dashboard.status === "error") {
    return <Notice tone="warning">CRM indisponible: {dashboard.error ?? "erreur inconnue"}.</Notice>;
  }

  const crm = dashboard.data.crm;
  const starterBlocked = dashboard.data.plan === "starter";
  const comparison = dashboard.data.comparison;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="CRM Pro/Enterprise"
        title="Pipeline commercial"
        description="Indicateurs operationnels internes. Aucune action CRM ne change les regles de routage, consentement, licence ou tenant."
        actions={
          crm ? (
            <Button href="/crm/leads" variant="secondary">Vue tableau</Button>
          ) : (
            <Badge tone="disabled">Module indisponible</Badge>
          )
        }
      />

      <section aria-label="Indicateurs Starter">
        <Grid columns="kpi">
          {dashboardKpis(dashboard.data).map((card) => (
            <KpiCard key={card.label} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
          ))}
        </Grid>
      </section>

      <section aria-label="Indicateurs CRM">
        <Grid columns="kpi">
          {crmKpis(dashboard.data).map((card) => (
            <KpiCard key={card.label} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
          ))}
        </Grid>
      </section>

      {crm ? (
        <Split>
          <Card title="Pipeline par statut">
            <DataTable
              columns={[
                { key: "status", header: "Statut", render: (row) => crmStatusLabel(row.status) },
                { key: "total", header: "Total", numeric: true, align: "right", render: (row) => row.total }
              ]}
              items={crm.pipeline}
              getKey={(row) => row.status}
              aria-label="Pipeline par statut"
              emptyLabel="Aucune activite CRM dans la fenetre."
              dense
            />
          </Card>
          <Card title="Conversion par produit">
            <DataTable
              columns={[
                { key: "product", header: "Produit", render: (row) => row.productKey },
                { key: "accepted", header: "Acceptes / recus", numeric: true, align: "right", render: (row) => `${row.accepted}/${row.received}` },
                { key: "rate", header: "Taux", numeric: true, align: "right", render: (row) => `${Math.round(row.rate * 100)}%` }
              ]}
              items={crm.conversionByProduct}
              getKey={(row) => row.productKey}
              aria-label="Conversion par produit"
              emptyLabel="Aucune conversion disponible."
              dense
            />
          </Card>
        </Split>
      ) : (
        <Notice tone={starterBlocked ? "info" : "warning"} title="Section CRM indisponible">
          {starterBlocked ? "Le CRM complet est disponible avec le plan Pro." : "Le flag broker_crm_enabled est ferme ou le scope ne permet pas le CRM avance."}
        </Notice>
      )}

      {comparison ? (
        <Card
          title="Comparaison avec la periode precedente"
          actions={<Button href="/reports/export" variant="secondary" size="sm">Exporter le rapport d'activite indicatif (CSV)</Button>}
        >
          <Grid columns="kpi">
            <KpiCard
              label="Leads recus (precedent)"
              value={comparison.previous.received}
              helper={`Ecart: ${comparison.delta.received >= 0 ? "+" : ""}${comparison.delta.received}`}
            />
            <KpiCard
              label="Leads acceptes (precedent)"
              value={comparison.previous.accepted}
              helper={`Ecart: ${comparison.delta.accepted >= 0 ? "+" : ""}${comparison.delta.accepted}`}
            />
            <KpiCard
              label="Refus/contestations (precedent)"
              value={comparison.previous.refused}
              helper={`Ecart: ${comparison.delta.refused >= 0 ? "+" : ""}${comparison.delta.refused}`}
            />
          </Grid>
        </Card>
      ) : null}

      {advisors.status === "success" && advisors.data.length > 0 ? (
        <Card title="Performance par conseiller">
          <DataTable
            columns={[
              { key: "advisor", header: "Conseiller", render: (row) => row.advisorId },
              { key: "received", header: "Recus", numeric: true, align: "right", render: (row) => row.received },
              { key: "accepted", header: "Acceptes", numeric: true, align: "right", render: (row) => row.accepted },
              { key: "won", header: "Gagnes", numeric: true, align: "right", render: (row) => row.won },
              { key: "lost", header: "Perdus", numeric: true, align: "right", render: (row) => row.lost },
              { key: "conversion", header: "Conversion", numeric: true, align: "right", render: (row) => `${Math.round(row.conversionRate * 100)}%` },
              {
                key: "firstAction",
                header: "Premiere action",
                numeric: true,
                align: "right",
                render: (row) => (row.averageFirstActionMinutes === null ? "-" : `${row.averageFirstActionMinutes} min`)
              }
            ]}
            items={advisors.data}
            getKey={(row) => row.advisorId}
            aria-label="Performance par conseiller"
            emptyLabel="Aucun conseiller mesure."
            dense
          />
        </Card>
      ) : null}

      {statement.status === "success" ? (
        <Card title="Consommation et facturation">
          <Grid columns="kpi">
            <KpiCard label="Leads recus (mois)" value={statement.data.leadsReceived} />
            <KpiCard label="Leads factures (brouillon)" value={statement.data.billableLeadCount} tone="info" />
            <KpiCard label="Leads non facturables" value={statement.data.nonBillableLeadCount} />
            <KpiCard label="Contestations creditees" value={statement.data.disputeCreditCount} tone="warning" />
            <KpiCard label="Credits pack restants" value={statement.data.packCreditsRemaining} />
            <KpiCard label="Montant estime" value={`${statement.data.estimatedAmount} ${statement.data.currency}`} helper="Estimation indicative" />
          </Grid>
          <Cluster>
            <Badge tone={statement.data.billingEnabled ? "info" : "disabled"}>billing_enabled: {String(statement.data.billingEnabled)}</Badge>
            <Badge tone="disabled">paiement: desactive</Badge>
            {statement.data.draft ? <Badge tone="disabled">{statement.data.draft.status}</Badge> : null}
          </Cluster>
          <p>{statement.data.notice || "Brouillon non facturable: aucun encaissement, aucune emission de facture."}</p>
        </Card>
      ) : null}

      {aiAssistance.status === "success" ? (
        <Card title="Assistance IA">
          <Cluster>
            <Badge tone={aiAssistance.data.enabled ? "success" : "disabled"}>enabled: {String(aiAssistance.data.enabled)}</Badge>
            <Badge tone={aiAssistance.data.modelCall ? "info" : "disabled"}>modelCall: {String(aiAssistance.data.modelCall)}</Badge>
            <Badge tone="warning">validation humaine obligatoire</Badge>
          </Cluster>
          <p>{aiAssistance.data.message}</p>
          {aiOptOut.status === "success" ? (
            <form action={setAiOptOutAction}>
              <input type="hidden" name="optOut" value={aiOptOut.data.optedOut ? "false" : "true"} />
              <input
                type="hidden"
                name="reason"
                value={aiOptOut.data.optedOut ? "Reactivation de l'assistance IA par le cabinet" : "Opt-out de l'assistance IA par le cabinet"}
              />
              <Cluster>
                <Badge tone={aiOptOut.data.optedOut ? "warning" : "neutral"}>
                  {aiOptOut.data.optedOut ? "Cabinet en opt-out IA" : "Assistance IA autorisee pour le cabinet"}
                </Badge>
                <Button type="submit" variant="secondary" size="sm">
                  {aiOptOut.data.optedOut ? "Reactiver l'assistance IA" : "Refuser l'assistance IA (opt-out cabinet)"}
                </Button>
              </Cluster>
            </form>
          ) : null}
          {aiNotice === "optout_saved" ? <Notice tone="success">Preference IA du cabinet enregistree et auditee.</Notice> : null}
          {aiNotice === "forbidden" ? <Notice tone="danger">Seul le proprietaire du cabinet peut modifier la preference IA.</Notice> : null}
        </Card>
      ) : null}

      {dashboard.data.licenseAlerts.length > 0 ? (
        <Card title="Alertes licence">
          <ul>
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} - {alert.status === "expired" ? "expiree" : "expirante"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageStack>
  );
}
