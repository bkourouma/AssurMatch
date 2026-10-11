import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { listStarterLeads, readBrokerDashboard } from "./lib/broker-api";
import { AttentionList, Button, Card, DataTable, Notice, PageHeader, PageStack, StatStrip, StatusBadge, starterStatusLabels } from "./lib/ui/broker-ui";
import type { DataTableColumn } from "./lib/ui/broker-ui";
import { dashboardAttention, dashboardStats, leadSummary } from "./lib/ui/broker-view-models";
import type { LeadSummaryViewModel } from "./lib/ui/broker-view-models";

export default async function BrokerShellPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Activite" }, { label: "Dashboard" }]}
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
        title="Portail courtier"
        description="Suivi des leads transmis par AssurMatch. Le courtier partenaire reste responsable de la prise de contact et de la suite commerciale."
        actions={<Button href="/leads">Voir les leads</Button>}
      />

      <BrokerDashboardSection />

      {session.profile.partnerPlan === "starter" ? (
        <Notice tone="info" title="CRM">
          Le CRM complet est disponible avec le plan Pro. Les modules indisponibles restent clairement séparés du portail Starter.
        </Notice>
      ) : null}
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
      <section aria-label="Dashboard Starter" className="bo-stack">
        <Card title="À traiter" description="Ce qui attend une action de votre part.">
          <AttentionList items={dashboardAttention(dashboard.data)} />
        </Card>
        <StatStrip items={dashboardStats(dashboard.data)} label="Volumes de leads" />
      </section>

      <WaitingLeads />

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

const WAITING_STATUSES = new Set(["assigned", "seen", "received", "broker_notified"]);

const waitingColumns: Array<DataTableColumn<LeadSummaryViewModel>> = [
  { key: "reference", header: "Reference", render: (lead) => <a className="bo-ref" href={`/leads/${encodeURIComponent(lead.id)}`}>{lead.reference}</a> },
  { key: "product", header: "Produit", render: (lead) => `${lead.product} / ${lead.country}` },
  { key: "status", header: "Statut", render: (lead) => <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: lead.statusTone }} /> },
  { key: "date", header: "Assigné le", render: (lead) => lead.assignedAt }
];

/** The leads a broker can act on now, newest first: the work itself, not only a count. */
async function WaitingLeads() {
  const result = await listStarterLeads();
  if (result.unauthenticated || result.status === "error") return null;
  const waiting = result.data.items
    .map(leadSummary)
    .filter((lead) => WAITING_STATUSES.has(lead.status))
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    .slice(0, 6);
  return (
    <Card
      title="Leads à traiter"
      description="Les plus récents en premier."
      actions={<Button href="/leads" variant="secondary" size="sm">Tous les leads</Button>}
    >
      <DataTable
        columns={waitingColumns}
        items={waiting}
        getKey={(lead) => lead.id}
        emptyLabel="Aucun lead en attente"
        emptyDescription="Les nouveaux leads assignés apparaîtront ici."
        aria-label="Leads en attente d'action"
      />
    </Card>
  );
}
