import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readAdminHealth, readAdminDashboard, readComplianceAlerts } from "./lib/admin-api";
import { formatDateTime, readQuoteRequests } from "./lib/operations-api";
import type { QuoteRequestRow } from "./lib/operations-api";
import type { ComplianceAlertsData } from "./lib/admin-api";
import { AttentionList, Badge, Button, Card, Cluster, DataTable, Form, FormActions, Grid, PageHeader, PageStack, StateMessage, StatStrip } from "./lib/ui/admin-ui";
import type { DataTableColumn } from "./lib/ui/admin-ui";
import { quoteStatusTones } from "./lib/ui/operations-tones";
import { dashboardAttention, dashboardStats, flagTone, sensitiveFeatureFlagKeys } from "./lib/ui/admin-view-models";

export default async function AdminHomePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Pilotage" }, { label: "Dashboard" }]}
          title="MFA requise"
          description="L'acces admin reste bloque tant que la MFA n'est pas verifiee."
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
          title="Acces refuse"
          description="Ce compte ne dispose pas d'un acces admin autorise."
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
      />

      {health.forbidden ? <StateMessage tone="warning">Acces sante systeme refuse pour ce role admin.</StateMessage> : null}
      {health.error && !health.forbidden ? <StateMessage tone="warning">Sante systeme indisponible: {health.error}</StateMessage> : null}
      {dashboard.forbidden ? (
        <StateMessage tone="danger">Acces dashboard plateforme refuse pour ce role admin.</StateMessage>
      ) : dashboard.status === "error" ? (
        <StateMessage tone="danger" title="Dashboard indisponible">L'API admin ne repond pas correctement: {dashboard.error}</StateMessage>
      ) : (
        <>
          <section aria-label="Dashboard plateforme synthese" className="bo-stack">
            <Card title="À traiter" description="Les files qui attendent une décision, les plus urgentes en premier.">
              <AttentionList items={dashboardAttention(dashboard.data)} />
            </Card>
            <StatStrip items={dashboardStats(dashboard.data)} label="Volumes et scope" />
          </section>
          <Grid columns="two" as="section" aria-label="Activite recente">
            <RecentQuoteRequests />
            <RecentAlerts />
          </Grid>
          <section aria-label="Synthese conformite et flags sensibles">
            <Card title="Feature flags sensibles (lecture seule)">
              <Cluster>
                {sensitiveFeatureFlagKeys.map((key) => {
                  const flag = dashboard.data.sensitiveFeatureFlags.find((item) => item.key === key);
                  return <Badge key={key} tone={flagTone(flag?.value ?? false)}>{key}: {flag?.value ? "actif" : "desactive"}</Badge>;
                })}
              </Cluster>
            </Card>
          </section>
        </>
      )}
    </PageStack>
  );
}

const quoteColumns: Array<DataTableColumn<QuoteRequestRow>> = [
  { key: "reference", header: "Reference", render: (row) => <a className="bo-ref" href={`/quote-requests/${encodeURIComponent(row.id)}`}>{row.publicReference}</a> },
  { key: "status", header: "Statut", render: (row) => <Badge tone={quoteStatusTones[row.status] ?? "neutral"}>{row.status}</Badge> },
  { key: "created", header: "Reçue le", render: (row) => formatDateTime(row.createdAt) }
];

/** The latest requests, so the dashboard shows the work and not only its counts. */
async function RecentQuoteRequests() {
  const result = await readQuoteRequests({ page: 1, pageSize: 6 });
  return (
    <Card title="Dernières demandes de devis" actions={<Button href="/quote-requests" variant="secondary" size="sm">Tout voir</Button>}>
      <DataTable
        columns={quoteColumns}
        items={result.data.items}
        getKey={(row) => row.id}
        emptyLabel="Aucune demande reçue"
        aria-label="Dernières demandes de devis"
      />
    </Card>
  );
}

type AlertRow = ComplianceAlertsData["items"][number];

const alertCategoryLabels: Record<AlertRow["category"], string> = {
  consent_missing: "Consentement absent",
  crm_flag_closed: "CRM fermé",
  rbac_denied: "RBAC refusé",
  cross_tenant_attempt: "Tentative inter-tenant",
  other: "Autre"
};

const alertColumns: Array<DataTableColumn<AlertRow>> = [
  { key: "category", header: "Catégorie", render: (row) => <Badge tone="warning">{alertCategoryLabels[row.category]}</Badge> },
  { key: "reason", header: "Motif", render: (row) => row.reason },
  { key: "occurred", header: "Le", render: (row) => formatDateTime(row.occurredAt) }
];

async function RecentAlerts() {
  const result = await readComplianceAlerts(1, 6);
  return (
    <Card title="Dernières alertes conformité" actions={<Button href="/dashboard/compliance-alerts" variant="secondary" size="sm">Tout voir</Button>}>
      <DataTable
        columns={alertColumns}
        items={result.data.items}
        getKey={(row) => row.id}
        emptyLabel="Aucune alerte"
        aria-label="Dernieres alertes conformite"
      />
    </Card>
  );
}
