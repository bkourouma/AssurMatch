import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readBrokerDashboard } from "./lib/broker-api";
import { Badge, Card, KpiCard, PageHeader, StateMessage } from "./lib/ui/broker-ui";
import { dashboardKpis } from "./lib/ui/broker-view-models";

export default async function BrokerShellPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Securite"
          title="MFA requise"
          description="Votre profil est reconnu, mais l'acces au portail courtier reste bloque tant que la MFA n'est pas verifiee."
        />
        <form action={logoutAction}><button className="button button--secondary" type="submit">Retour au login</button></form>
      </div>
    );
  }
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Acces"
          title="Acces refuse"
          description="Ce compte ne dispose pas d'un acces courtier autorise."
        />
        <form action={logoutAction}><button className="button button--secondary" type="submit">Changer de compte</button></form>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        kicker={`Plan ${session.profile.partnerPlan ?? "courtier"}`}
        title="Portail courtier"
        description="Suivi des leads transmis par AssurMatch. Le courtier partenaire reste responsable de la prise de contact et de la suite commerciale."
        actions={<Badge tone="info">Connecte: {session.profile.actorId ?? "profil courtier"}</Badge>}
      />

      <BrokerDashboardSection />

      <section className="split-layout">
        <Card plain>
          <h2 className="section-title">Notifications</h2>
          <ul className="simple-list">
            <li>Nouveau lead assigne disponible dans la liste.</li>
            <li>Les notifications restent limitees au tenant courtier connecte.</li>
          </ul>
        </Card>
        <Card plain>
          <h2 className="section-title">Disponibilite CRM</h2>
          <p className="page-description">
            Le CRM complet est disponible avec le plan Pro. Les modules indisponibles restent clairement separes du portail Starter.
          </p>
        </Card>
      </section>
    </div>
  );
}

async function BrokerDashboardSection() {
  const dashboard = await readBrokerDashboard();
  if (dashboard.unauthenticated) {
    return <StateMessage>Session expiree. Reconnectez-vous pour voir le dashboard.</StateMessage>;
  }
  if (dashboard.forbidden) {
    return <StateMessage tone="danger">Acces dashboard refuse. Le flag broker_dashboard_enabled est ferme ou la MFA est requise.</StateMessage>;
  }
  if (dashboard.status === "error") {
    return <StateMessage tone="warning">Dashboard indisponible: {dashboard.error ?? "erreur inconnue"}.</StateMessage>;
  }

  return (
    <>
      <section className="broker-grid broker-grid--kpi" aria-label="Dashboard Starter">
        {dashboardKpis(dashboard.data).map((card) => (
          <KpiCard key={card.label} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
        ))}
      </section>

      {dashboard.data.licenseAlerts.length > 0 ? (
        <Card plain>
          <h2 className="section-title">Alertes licence</h2>
          <ul className="simple-list">
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} - licence {alert.status === "expired" ? "expiree" : "expirant prochainement"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <StateMessage title="Licences">Aucune alerte licence exposee pour ce tenant.</StateMessage>
      )}
    </>
  );
}
