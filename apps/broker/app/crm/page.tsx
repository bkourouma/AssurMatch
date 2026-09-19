import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerAIAssistance, readBrokerAdvisors, readBrokerAiOptOut, readBrokerBillingStatement, readBrokerDashboardWithComparison } from "../lib/broker-api";
import { setAiOptOutAction } from "../lib/crm-ai-actions";
import { Badge, Card, KpiCard, PageHeader, StateMessage } from "../lib/ui/broker-ui";
import { crmKpis, dashboardKpis } from "../lib/ui/broker-view-models";

export default async function BrokerCrmPage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai: aiNotice } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status !== "authenticated") {
    if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm", session.error ?? "session_required"));
    if (session.status === "mfa_required") redirect(loginRedirect("/crm", "mfa_required"));
    if (session.status === "forbidden") {
      return (
        <div className="page-stack">
          <PageHeader
            kicker="CRM"
            title="Acces CRM refuse"
            description="Le CRM courtier exige un courtier authentifie, la MFA verifiee et les permissions CRM."
          />
        </div>
      );
    }

    return <StateMessage tone="warning">CRM indisponible: {session.error ?? "erreur inconnue"}.</StateMessage>;
  }
  if (isStarterCrmDenied(session.profile)) {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="CRM"
          title="CRM complet indisponible"
          description="Le portail Starter reste centre sur les leads recus et leurs actions autorisees."
          actions={<Badge tone="disabled">Module indisponible</Badge>}
        />
        <StateMessage tone="info" title="Plan Starter">
          Le CRM complet est disponible avec le plan Pro.
        </StateMessage>
      </div>
    );
  }

  const dashboard = await readBrokerDashboardWithComparison();
  const advisors = await readBrokerAdvisors();
  const [aiAssistance, aiOptOut, statement] = await Promise.all([readBrokerAIAssistance(), readBrokerAiOptOut(), readBrokerBillingStatement()]);
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

      {dashboard.data.comparison ? (
        <Card plain>
          <h2 className="section-title">Comparaison avec la periode precedente</h2>
          <div className="broker-grid broker-grid--kpi">
            <KpiCard label="Leads recus (precedent)" value={dashboard.data.comparison.previous.received} helper={`Ecart: ${dashboard.data.comparison.delta.received >= 0 ? "+" : ""}${dashboard.data.comparison.delta.received}`} />
            <KpiCard label="Leads acceptes (precedent)" value={dashboard.data.comparison.previous.accepted} helper={`Ecart: ${dashboard.data.comparison.delta.accepted >= 0 ? "+" : ""}${dashboard.data.comparison.delta.accepted}`} />
            <KpiCard label="Refus/contestations (precedent)" value={dashboard.data.comparison.previous.refused} helper={`Ecart: ${dashboard.data.comparison.delta.refused >= 0 ? "+" : ""}${dashboard.data.comparison.delta.refused}`} />
          </div>
          <a className="button button--secondary" href="/reports/export">Exporter le rapport d'activite indicatif (CSV)</a>
        </Card>
      ) : null}

      {advisors.status === "success" && advisors.data.length > 0 ? (
        <Card plain>
          <h2 className="section-title">Performance par conseiller</h2>
          <ul className="simple-list">
            {advisors.data.map((advisor) => (
              <li key={advisor.advisorId}>
                {advisor.advisorId}: {advisor.received} lead(s), {advisor.accepted} accepte(s), {advisor.won} gagne(s), {advisor.lost} perdu(s), conversion {Math.round(advisor.conversionRate * 100)}%
                {advisor.averageFirstActionMinutes === null ? "" : `, premiere action ${advisor.averageFirstActionMinutes} min`}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {statement.status === "success" ? (
        <Card plain>
          <h2 className="section-title">Consommation et facturation</h2>
          <div className="broker-grid broker-grid--kpi">
            <KpiCard label="Leads recus (mois)" value={statement.data.leadsReceived} />
            <KpiCard label="Leads factures (brouillon)" value={statement.data.billableLeadCount} tone="info" />
            <KpiCard label="Leads non facturables" value={statement.data.nonBillableLeadCount} />
            <KpiCard label="Contestations creditees" value={statement.data.disputeCreditCount} tone="warning" />
            <KpiCard label="Credits pack restants" value={statement.data.packCreditsRemaining} />
            <KpiCard label="Montant estime" value={`${statement.data.estimatedAmount} ${statement.data.currency}`} helper="Estimation indicative" />
          </div>
          <div className="inline-cluster">
            <Badge tone={statement.data.billingEnabled ? "info" : "disabled"}>billing_enabled: {String(statement.data.billingEnabled)}</Badge>
            <Badge tone="disabled">paiement: desactive</Badge>
            {statement.data.draft ? <Badge tone="disabled">{statement.data.draft.status}</Badge> : null}
          </div>
          <p className="page-description">{statement.data.notice || "Brouillon non facturable: aucun encaissement, aucune emission de facture."}</p>
        </Card>
      ) : null}

      {aiAssistance.status === "success" ? (
        <Card plain>
          <h2 className="section-title">Assistance IA</h2>
          <div className="broker-grid">
            <Badge tone={aiAssistance.data.enabled ? "success" : "disabled"}>enabled: {String(aiAssistance.data.enabled)}</Badge>
            <Badge tone={aiAssistance.data.modelCall ? "info" : "disabled"}>modelCall: {String(aiAssistance.data.modelCall)}</Badge>
            <Badge tone="warning">validation humaine obligatoire</Badge>
          </div>
          <p className="page-description">{aiAssistance.data.message}</p>
          {aiOptOut.status === "success" ? (
            <form action={setAiOptOutAction} className="inline-cluster">
              <input type="hidden" name="optOut" value={aiOptOut.data.optedOut ? "false" : "true"} />
              <input type="hidden" name="reason" value={aiOptOut.data.optedOut ? "Reactivation de l'assistance IA par le cabinet" : "Opt-out de l'assistance IA par le cabinet"} />
              <Badge tone={aiOptOut.data.optedOut ? "warning" : "neutral"}>{aiOptOut.data.optedOut ? "Cabinet en opt-out IA" : "Assistance IA autorisee pour le cabinet"}</Badge>
              <button type="submit" className="button button--secondary">{aiOptOut.data.optedOut ? "Reactiver l'assistance IA" : "Refuser l'assistance IA (opt-out cabinet)"}</button>
            </form>
          ) : null}
          {aiNotice === "optout_saved" ? <p role="status">Preference IA du cabinet enregistree et auditee.</p> : null}
          {aiNotice === "forbidden" ? <p role="alert">Seul le proprietaire du cabinet peut modifier la preference IA.</p> : null}
        </Card>
      ) : null}

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
