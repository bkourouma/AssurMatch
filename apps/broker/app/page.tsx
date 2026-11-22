import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { productLabel } from "./lib/product-vocabulary";
import { listStarterLeads, readBrokerDashboard } from "./lib/broker-api";
import { AttentionList, Button, Card, DataTable, Notice, PageHeader, PageStack, StatStrip, StatusBadge, starterStatusLabels } from "./lib/ui/broker-ui";
import type { DataTableColumn } from "./lib/ui/broker-ui";
import { dashboardAttention, dashboardStats, daysSince, formatDate, formatWaiting, leadSummary } from "./lib/ui/broker-view-models";
import type { LeadSummaryViewModel } from "./lib/ui/broker-view-models";
import styles from "./lib/ui/broker-screens.module.css";
import { AiInsightsDashboardSection } from "./lib/ui/ai-insights-panel";
import { CrmKpiSection } from "./lib/ui/crm-kpi-section";

interface BrokerShellPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BrokerShellPage({ searchParams }: BrokerShellPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const insight = Array.isArray(params.insight) ? params.insight[0] : params.insight;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Activité" }, { label: "Dashboard" }]}
          title="MFA requise"
          description="Votre profil est reconnu, mais l'accès au portail courtier reste bloqué tant que la MFA n'est pas vérifiée."
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
          breadcrumb={[{ label: "Activité" }, { label: "Dashboard" }]}
          title="Accès refusé"
          description="Ce compte ne dispose pas d'un accès courtier autorisé."
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
        breadcrumb={[{ label: "Activité" }, { label: "Dashboard" }]}
        title="Portail courtier"
        description="Suivi des leads transmis par AssurMatch. Le courtier partenaire reste responsable de la prise de contact et de la suite commerciale."
        actions={<Button href="/leads">Voir les leads</Button>}
      />

      {notice === "crm_requires_pro" ? (
        <Notice tone="warning" title="CRM non disponible avec votre formule">Le CRM est réservé aux formules Pro et Enterprise. Vos leads restent disponibles dans <a href="/leads">Leads</a>.</Notice>
      ) : null}

      <BrokerDashboardSection />

      {/* Lot 3 (spec 069 FR-004, DASH-B-009): AI insights next to the KPI; same guard as the pipeline page. */}
      <AiInsightsDashboardSection profile={session.profile} notice={insight} />

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
    return (
      <Notice tone="info" title="Session expirée">
        Reconnectez-vous pour voir le dashboard. <a href={loginRedirect("/", "session_expired")}>Se reconnecter</a>
      </Notice>
    );
  }
  if (dashboard.forbidden) {
    return (
      <Notice tone="danger" title="Accès dashboard refusé">
        Le dashboard est fermé pour votre compte (fonctionnalité désactivée ou MFA à vérifier). Les pages Leads restent accessibles :{" "}
        <a href="/leads">Ouvrir les leads</a>.
      </Notice>
    );
  }
  if (dashboard.status === "error") {
    return (
      <Notice tone="warning" title="Dashboard indisponible">
        {dashboard.error ?? "Erreur inconnue"}. Aucune donnée n&apos;a été modifiée. <a href="/">Réessayer</a> ou <a href="/leads">ouvrir les leads</a>.
      </Notice>
    );
  }

  return (
    <>
      <section aria-label="Dashboard Starter" className="bo-stack">
        <Card title="À traiter" description="Ce qui attend une action de votre part.">
          <AttentionList items={dashboardAttention(dashboard.data)} />
        </Card>
      </section>

      {/* The work itself comes before the volumes: the first thing visible is a lead to open. */}
      <WaitingLeads />

      <StatStrip items={dashboardStats(dashboard.data)} label="Volumes de leads" />

      {/* Lot 3 (spec 069): PRD §20 CRM KPIs, rendered only when the API sends the `crm` section (never for Starter). */}
      <CrmKpiSection data={dashboard.data} />

      {dashboard.data.licenseAlerts.length > 0 ? (
        <Card title="Alertes licence" actions={<Button href="/licenses" variant="secondary" size="sm">Ouvrir les licences</Button>}>
          <ul className="bo-list">
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} - licence {alert.status === "expired" ? "expirée" : "expirant prochainement"} ({formatDate(alert.expiresAt)})
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Notice tone="info" title="Licences">Aucune alerte licence pour votre cabinet.</Notice>
      )}
    </>
  );
}

const WAITING_STATUSES = new Set(["assigned", "seen", "received", "broker_notified"]);
const WAITING_LIST_SIZE = 6;

/** Built per request: « Attente » is the time since the lead was assigned, counted in whole days. */
function waitingColumns(now: Date): Array<DataTableColumn<LeadSummaryViewModel>> {
  return [
    { key: "reference", header: "Référence", render: (lead) => <a className="bo-ref" href={`/leads/${encodeURIComponent(lead.id)}`}>{lead.reference}</a> },
    { key: "product", header: "Produit", render: (lead) => `${productLabel(lead.product)} / ${lead.country}` },
    { key: "status", header: "Statut", render: (lead) => <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: lead.statusTone }} /> },
    { key: "date", header: "Assigné le", render: (lead) => lead.assignedAt },
    { key: "waiting", header: "Attente", render: (lead) => formatWaiting(daysSince(lead.assignedAt, now)) },
    {
      key: "action",
      header: "Action",
      render: (lead) => (
        <a className={styles.rowAction} href={`/leads/${encodeURIComponent(lead.id)}`} aria-label={`Traiter le lead ${lead.reference}`}>
          Traiter
        </a>
      )
    }
  ];
}

/** The leads a broker can act on now, longest-waiting first: the work itself, not only a count. */
async function WaitingLeads() {
  const result = await listStarterLeads();
  if (result.unauthenticated || result.status === "error") return null;
  // Oldest first, read from the raw ISO date; missing or unreadable dates go last.
  const dateMs = (value: unknown): number => {
    const ms = typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  };
  const all = result.data.items
    .map((item) => ({ lead: leadSummary(item), at: dateMs(item.assignedAt) }))
    .filter(({ lead }) => WAITING_STATUSES.has(lead.status))
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1))
    .map(({ lead }) => lead);
  const waiting = all.slice(0, WAITING_LIST_SIZE);
  return (
    <Card
      title="Leads à traiter"
      description={
        all.length > waiting.length
          ? `Les ${waiting.length} plus anciens sur ${all.length}, ceux qui attendent depuis le plus longtemps d'abord.`
          : "Les plus anciens en premier : ce sont ceux qui attendent depuis le plus longtemps."
      }
      actions={<Button href="/leads" variant="secondary" size="sm">Tous les leads</Button>}
    >
      <DataTable
        columns={waitingColumns(new Date())}
        items={waiting}
        getKey={(lead) => lead.id}
        emptyLabel="Aucun lead en attente"
        emptyDescription="Les nouveaux leads assignés apparaîtront ici. Vous serez notifié à chaque nouvelle assignation."
        aria-label="Leads en attente d'action"
      />
    </Card>
  );
}
