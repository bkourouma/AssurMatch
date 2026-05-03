import { redirect } from "next/navigation";
import { loginRedirect } from "../lib/backoffice-auth";
import { readBrokerDashboard } from "../lib/broker-api";
import { Badge, Card, KpiCard, PageHeader, StateMessage } from "../lib/ui/broker-ui";
import { crmKpis, dashboardKpis } from "../lib/ui/broker-view-models";

export default async function BrokerCrmPage() {
  const dashboard = await readBrokerDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/crm", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="CRM"
          title="Acces dashboard refuse"
          description="Le dashboard courtier exige un courtier authentifie, la MFA verifiee et le flag broker_dashboard_enabled actif."
        />
      </div>
    );
  }
  if (dashboard.status === "error") {
    return <StateMessage tone="warning">CRM indisponible: {dashboard.error ?? "erreur inconnue"}.</StateMessage>;
  }

  const crm = dashboard.data.crm;
  const starterBlocked = dashboard.data.plan === "starter";

  return (
    <div className="page-stack">
      <PageHeader
        kicker="CRM Pro/Enterprise"
        title="Pipeline commercial"
        description="Indicateurs operationnels internes. Aucune action CRM ne change les regles de routage, consentement, licence ou tenant."
        actions={crm ? <a className="button button--secondary" href="/crm/leads">Vue tableau</a> : <Badge tone="disabled">Module indisponible</Badge>}
      />

      <section className="broker-grid broker-grid--kpi" aria-label="Indicateurs Starter">
        {dashboardKpis(dashboard.data).map((card) => (
          <KpiCard key={card.label} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
        ))}
      </section>

      <section className="broker-grid broker-grid--kpi" aria-label="Indicateurs CRM">
        {crmKpis(dashboard.data).map((card) => (
          <KpiCard key={card.label} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
        ))}
      </section>

      {crm ? (
        <section className="split-layout">
          <Card plain>
            <h2 className="section-title">Pipeline par statut</h2>
            {crm.pipeline.length === 0 ? (
              <p className="page-description">Aucune activite CRM dans la fenetre.</p>
            ) : (
              <ul className="simple-list">
                {crm.pipeline.map(({ status, total }) => (
                  <li key={status}>{status}: {total}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card plain>
            <h2 className="section-title">Conversion par produit</h2>
            {crm.conversionByProduct.length === 0 ? (
              <p className="page-description">Aucune conversion disponible.</p>
            ) : (
              <ul className="simple-list">
                {crm.conversionByProduct.map(({ productKey, received, accepted, rate }) => (
                  <li key={productKey}>{productKey}: {accepted}/{received} ({Math.round(rate * 100)}%)</li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : (
        <StateMessage tone={starterBlocked ? "info" : "warning"} title="Section CRM indisponible">
          {starterBlocked ? "Le CRM complet est disponible avec le plan Pro." : "Le flag broker_crm_enabled est ferme ou le scope ne permet pas le CRM avance."}
        </StateMessage>
      )}

      {dashboard.data.licenseAlerts.length > 0 ? (
        <Card plain>
          <h2 className="section-title">Alertes licence</h2>
          <ul className="simple-list">
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} - {alert.status === "expired" ? "expiree" : "expirante"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
