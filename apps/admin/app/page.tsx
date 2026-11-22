import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readAdminHealth, readAdminDashboard, readComplianceAlerts } from "./lib/admin-api";
import { formatDateTime, readQuoteRequests } from "./lib/operations-api";
import type { QuoteRequestRow } from "./lib/operations-api";
import type { ComplianceAlertsData } from "./lib/admin-api";
import { AttentionList, Badge, Button, Card, DataTable, Form, FormActions, Grid, PageHeader, PageStack, StateMessage, StatStrip } from "./lib/ui/admin-ui";
import type { DataTableColumn } from "./lib/ui/admin-ui";
import { quoteStatusTones } from "./lib/ui/operations-tones";
import { quoteStatusLabel } from "./lib/ui/operations-labels";
import { complianceCategoryLabel, dashboardAttention, dashboardStats } from "./lib/ui/admin-view-models";
import { SensitiveFlagsCard } from "./lib/ui/dashboard-blocks";
import { readFailureDetail } from "./lib/auth-error-messages";

export default async function AdminHomePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Pilotage" }, { label: "Dashboard" }]}
          title="MFA requise"
          description="L'accès admin reste bloqué tant que la MFA n'est pas vérifiée."
        />
        <Form action={logoutAction}>
          <FormActions align="start">
            <Button type="submit" variant="secondary">Retour au login</Button>
          </FormActions>
        </Form>
      </PageStack>
    );
  }
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Pilotage" }, { label: "Dashboard" }]}
          title="Accès refusé"
          description="Ce compte ne dispose pas d'un accès admin autorisé."
        />
        <Form action={logoutAction}>
          <FormActions align="start">
            <Button type="submit" variant="secondary">Changer de compte</Button>
          </FormActions>
        </Form>
      </PageStack>
    );
  }
  const health = await readAdminHealth();
  if (health.unauthenticated) redirect(loginRedirect("/", health.error ?? "session_required"));
  const dashboard = await readAdminDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/", dashboard.error ?? "session_required"));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Dashboard" }]}
        title="Dashboard admin"
        description="Ce qui demande une action, puis les volumes de la fenêtre. Les modules sensibles restent contrôlés par les règles et flags existants."
        actions={<Button href="/dashboard" variant="secondary">Indicateurs détaillés</Button>}
      />

      {health.forbidden ? <StateMessage tone="warning">Accès santé système refusé pour ce rôle admin.</StateMessage> : null}
      {health.error && !health.forbidden ? <StateMessage tone="warning">Santé système indisponible. {readFailureDetail(health.error)}</StateMessage> : null}
      {dashboard.forbidden ? (
        <StateMessage tone="danger">Accès dashboard plateforme refusé pour ce rôle admin.</StateMessage>
      ) : dashboard.status === "error" ? (
        <StateMessage tone="danger" title="Dashboard indisponible">
          L&apos;API admin ne répond pas correctement. {readFailureDetail(dashboard.error)} Rechargez la page ; si l&apos;erreur persiste, vérifiez l&apos;état de l&apos;API avant de relancer. <a href="/">Recharger le dashboard</a>
        </StateMessage>
      ) : (
        <>
          <section aria-label="Dashboard plateforme synthèse" className="bo-stack">
            <Card title="À traiter" description="Les files qui attendent une décision, les plus urgentes en premier.">
              <AttentionList items={dashboardAttention(dashboard.data)} />
            </Card>
            <StatStrip items={dashboardStats(dashboard.data)} label="Volumes et scope" />
          </section>
          <Grid columns="two" as="section" aria-label="Activité récente">
            <RecentQuoteRequests />
            <RecentAlerts />
          </Grid>
          <SensitiveFlagsCard flags={dashboard.data.sensitiveFeatureFlags} ariaLabel="Synthèse conformité et flags sensibles" />
        </>
      )}
    </PageStack>
  );
}

const quoteColumns: Array<DataTableColumn<QuoteRequestRow>> = [
  { key: "reference", header: "Référence", render: (row) => <a className="bo-ref" href={`/quote-requests/${encodeURIComponent(row.id)}`}>{row.publicReference}</a> },
  { key: "status", header: "Statut", render: (row) => <Badge tone={quoteStatusTones[row.status] ?? "neutral"} title={row.status}>{quoteStatusLabel(row.status)}</Badge> },
  { key: "created", header: "Reçue le", render: (row) => formatDateTime(row.createdAt) }
];

/** The latest requests, so the dashboard shows the work and not only its counts. */
async function RecentQuoteRequests() {
  const result = await readQuoteRequests({ page: 1, pageSize: 6 });
  return (
    <Card title="Dernières demandes de devis" actions={<Button href="/quote-requests" variant="secondary" size="sm">Tout voir</Button>}>
      {result.status === "success" ? (
        <DataTable
          columns={quoteColumns}
          items={result.data.items}
          getKey={(row) => row.id}
          getRowHref={(row) => `/quote-requests/${encodeURIComponent(row.id)}`}
          emptyLabel="Aucune demande reçue"
          emptyDescription="Les demandes apparaissent ici dès qu'un visiteur envoie un devis."
          aria-label="Dernières demandes de devis"
        />
      ) : (
        <StateMessage tone="warning">
          {result.status === "forbidden" ? "Lecture des demandes refusée pour ce rôle admin." : <>Demandes indisponibles pour le moment. {readFailureDetail(result.error)} Le reste du dashboard n&apos;est pas affecté ; ouvrez <a href="/quote-requests">la liste des demandes</a> pour réessayer.</>}
        </StateMessage>
      )}
    </Card>
  );
}

type AlertRow = ComplianceAlertsData["items"][number];

const alertColumns: Array<DataTableColumn<AlertRow>> = [
  { key: "category", header: "Catégorie", render: (row) => <Badge tone="warning">{complianceCategoryLabel(row.category)}</Badge> },
  { key: "reason", header: "Motif", render: (row) => row.reason },
  { key: "occurred", header: "Le", render: (row) => formatDateTime(row.occurredAt) }
];

async function RecentAlerts() {
  const result = await readComplianceAlerts(1, 6);
  return (
    <Card title="Dernières alertes conformité" actions={<Button href="/dashboard/compliance-alerts" variant="secondary" size="sm">Tout voir</Button>}>
      {result.status === "success" ? (
        <DataTable
          columns={alertColumns}
          items={result.data.items}
          getKey={(row) => row.id}
          emptyLabel="Aucune alerte"
          emptyDescription="Aucun refus audité récemment."
          aria-label="Dernières alertes conformité"
        />
      ) : (
        <StateMessage tone="warning">
          {result.forbidden ? "Lecture des alertes refusée pour ce rôle admin." : <>Alertes indisponibles pour le moment. {readFailureDetail(result.error)} Ouvrez <a href="/dashboard/compliance-alerts">le journal des alertes</a> pour réessayer.</>}
        </StateMessage>
      )}
    </Card>
  );
}
