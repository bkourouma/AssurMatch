import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readBrokerDashboard } from "./lib/broker-api";
import { Badge, Button, Card, Grid, KpiCard, Notice, PageHeader, PageStack, Split } from "./lib/ui/broker-ui";
import { dashboardKpis } from "./lib/ui/broker-view-models";

export default async function BrokerShellPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Activite" }, { label: "Dashboard" }]}
          kicker="Securite"
          title="MFA requise"
          description="Votre profil est reconnu, mais l'acces au portail courtier reste bloque tant que la MFA n'est pas verifiee."
        />
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">Retour au login</Button>
        </form>
      </PageStack>
    );
  }
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Activite" }, { label: "Dashboard" }]}
          kicker="Acces"
          title="Acces refuse"
          description="Ce compte ne dispose pas d'un acces courtier autorise."
        />
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">Changer de compte</Button>
        </form>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Activite" }, { label: "Dashboard" }]}
        kicker={`Plan ${session.profile.partnerPlan ?? "courtier"}`}
        title="Portail courtier"
        description="Suivi des leads transmis par AssurMatch. Le courtier partenaire reste responsable de la prise de contact et de la suite commerciale."
        actions={<Badge tone="info">Connecte: {session.profile.actorId ?? "profil courtier"}</Badge>}
      />

      <BrokerDashboardSection />

      <Split>
        <Card title="Notifications">
          <ul>
            <li>Nouveau lead assigne disponible dans la liste.</li>
            <li>Les notifications restent limitees au tenant courtier connecte.</li>
          </ul>
        </Card>
        <Card title="Disponibilite CRM">
          <p>
            Le CRM complet est disponible avec le plan Pro. Les modules indisponibles restent clairement separes du portail Starter.
          </p>
        </Card>
      </Split>
    </PageStack>
  );
}

async function BrokerDashboardSection() {
  const dashboard = await readBrokerDashboard();
  if (dashboard.unauthenticated) {
    return <Notice tone="info">Session expiree. Reconnectez-vous pour voir le dashboard.</Notice>;
  }
  if (dashboard.forbidden) {
    return <Notice tone="danger">Acces dashboard refuse. Le flag broker_dashboard_enabled est ferme ou la MFA est requise.</Notice>;
  }
  if (dashboard.status === "error") {
    return <Notice tone="warning">Dashboard indisponible: {dashboard.error ?? "erreur inconnue"}.</Notice>;
  }

  return (
    <>
      <section aria-label="Dashboard Starter">
        <Grid columns="kpi">
          {dashboardKpis(dashboard.data).map((card) => (
            <KpiCard key={card.label} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
          ))}
        </Grid>
      </section>

      {dashboard.data.licenseAlerts.length > 0 ? (
        <Card title="Alertes licence">
          <ul>
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} - licence {alert.status === "expired" ? "expiree" : "expirant prochainement"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Notice tone="info" title="Licences">Aucune alerte licence exposee pour ce tenant.</Notice>
      )}
    </>
  );
}
