import { redirect } from "next/navigation";
import { AGENCY_PARAM, agencyQuery } from "../lib/agency-filter";
import { loadAgencyFilter } from "../lib/agency-filter-loader";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerAIAssistance, readBrokerAdvisors, readBrokerAiOptOut, readBrokerBillingStatement, readBrokerDashboardWithComparison, readBrokerTeam } from "../lib/broker-api";
import { setAiOptOutAction } from "../lib/crm-ai-actions";
import { crmStatusLabel } from "../lib/lead-vocabulary";
import { productLabel } from "../lib/product-vocabulary";
import {
  Badge,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  Notice,
  PageHeader,
  PageStack,
  Split,
  StatStrip,
  TenantWriteGuard
} from "../lib/ui/broker-ui";
import type { StatItem } from "../lib/ui/broker-ui";
import { AgencyFilterForm } from "../lib/ui/agency-filter-form";
import { TENANT_SUSPENDED_MESSAGE, isTenantReadOnly } from "../lib/broker-permissions";
import { AiInsightsPanel } from "../lib/ui/ai-insights-panel";
import { CrmKpiSection } from "../lib/ui/crm-kpi-section";
import { CONVERSION_LABEL, crmKpis, dashboardStats, formatRate, wonOverReceived } from "../lib/ui/broker-view-models";
import { advisorDisplayName } from "../lib/team-options";
import styles from "../lib/ui/broker-screens.module.css";

const BREADCRUMB = [{ label: "CRM" }, { label: "Pipeline" }];

/** Statut du brouillon de facture mensuel: la clé de l'API n'est jamais montrée telle quelle. */
const DRAFT_STATUS_LABELS: Record<string, string> = { draft_not_billable: "Brouillon non facturable" };

function draftStatusLabel(status: string): string {
  return DRAFT_STATUS_LABELS[status] ?? "Brouillon";
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

export default async function BrokerCrmPage({ searchParams }: { searchParams: Promise<{ ai?: string; agence?: string; insight?: string }> }) {
  const { ai: aiNotice, insight: insightNotice, [AGENCY_PARAM]: agenceParam } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status !== "authenticated") {
    if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm", session.error ?? "session_required"));
    if (session.status === "mfa_required") redirect(loginRedirect("/crm", "mfa_required"));
    if (session.status === "forbidden") {
      return (
        <PageStack>
          <PageHeader
            breadcrumb={BREADCRUMB}
            title="Accès CRM refusé"
            description="Le CRM courtier exige un courtier authentifié, la MFA vérifiée et les permissions CRM."
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
          title="CRM complet indisponible"
          description="Le portail Starter reste centré sur les leads reçus et leurs actions autorisées."
          actions={<Badge tone="disabled">Module indisponible</Badge>}
        />
        <Notice tone="info" title="Plan Starter">
          Le CRM complet est disponible avec le plan Pro.
        </Notice>
      </PageStack>
    );
  }

  // Spec 064: Enterprise agency DISPLAY filter (no access restriction); other plans make no extra API call.
  const agency = await loadAgencyFilter(session.profile, agenceParam);
  const filterQuery = agencyQuery(agency);
  const dashboard = await readBrokerDashboardWithComparison(filterQuery);
  const advisors = await readBrokerAdvisors(filterQuery);
  const [aiAssistance, aiOptOut, statement, team] = await Promise.all([readBrokerAIAssistance(), readBrokerAiOptOut(), readBrokerBillingStatement(), readBrokerTeam()]);
  // Best effort: a role without team right gets 403, advisors are then shown without a name.
  const teamMembers = team.status === "success" ? team.data : [];
  if (dashboard.unauthenticated) redirect(loginRedirect("/crm", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          title="Accès dashboard refusé"
          description="Le dashboard courtier exige un courtier authentifié, la MFA vérifiée et le flag broker_dashboard_enabled actif."
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
  const comparisonStats: StatItem[] = comparison
    ? [
        { label: "Leads reçus (précédent)", value: comparison.previous.received, helper: `Écart: ${signed(comparison.delta.received)}` },
        { label: "Leads acceptés (précédent)", value: comparison.previous.accepted, helper: `Écart: ${signed(comparison.delta.accepted)}` },
        { label: "Refus/contestations (précédent)", value: comparison.previous.refused, helper: `Écart: ${signed(comparison.delta.refused)}` }
      ]
    : [];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Pipeline commercial"
        description="Indicateurs opérationnels internes du CRM Pro/Enterprise. Aucune action CRM ne change les règles de routage, consentement, licence ou tenant."
        actions={
          crm ? (
            <Cluster>
              <Button href="/crm/kanban" variant="secondary">Vue Kanban</Button>
              <Button href="/crm/leads" variant="secondary">Vue tableau</Button>
              {session.profile.partnerPlan === "enterprise" ? (
                <Button href="/crm/loss-analysis" variant="secondary">Analyse des pertes</Button>
              ) : (
                <Badge tone="disabled">Analyse des pertes : plan Enterprise requis</Badge>
              )}
            </Cluster>
          ) : (
            <Badge tone="disabled">Module indisponible</Badge>
          )
        }
      />

      <AgencyFilterForm action="/crm" filter={agency} fieldId="crm-agency-filter" />

      {dashboard.data.licenseAlerts.length > 0 ? (
        <Notice tone="warning" title="Alertes licence">
          <ul className="bo-list">
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} - {alert.status === "expired" ? "expirée" : "expirante"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)}) - <a href="/licenses">Ouvrir les licences</a>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <section aria-label="Indicateurs Starter" className="bo-stack">
        <h2 className="bo-section-title">Leads</h2>
        <StatStrip items={dashboardStats(dashboard.data)} label="Volumes de leads" />
      </section>

      {crm ? (
        <section aria-label="Indicateurs CRM" className="bo-stack">
          <h2 className="bo-section-title">Activité CRM</h2>
          <StatStrip items={crmKpis(dashboard.data)} label="Activité CRM" />
        </section>
      ) : null}

      <CrmKpiSection data={dashboard.data} />

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
              /* The status opens the table filtered on it: from a figure to the leads behind it. */
              getRowHref={(row) => `/crm/leads?status=${encodeURIComponent(row.status)}`}
              aria-label="Pipeline par statut"
              emptyLabel="Aucune activité CRM dans la fenêtre."
              emptyDescription="Les statuts apparaissent dès qu'un lead est assigné à votre cabinet."
              dense
            />
          </Card>
          <Card title="Conversion par produit">
            <DataTable
              columns={[
                { key: "product", header: "Produit", render: (row) => productLabel(row.productKey) },
                { key: "won", header: CONVERSION_LABEL, numeric: true, align: "right", render: (row) => wonOverReceived(row) },
                { key: "rate", header: "Taux", numeric: true, align: "right", render: (row) => formatRate(row.rate) }
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
          {starterBlocked ? "Le CRM complet est disponible avec le plan Pro." : "Le flag broker_crm_enabled est fermé ou le scope ne permet pas le CRM avancé."}
        </Notice>
      )}

      {comparison ? (
        <section aria-label="Comparaison avec la période précédente" className="bo-stack">
          <div className={styles.sectionHead}>
            <h2 className="bo-section-title">Comparaison avec la période précédente</h2>
            <Button href="/reports/export" variant="secondary" size="sm">Exporter le rapport d'activité indicatif (CSV)</Button>
          </div>
          <StatStrip items={comparisonStats} label="Comparaison avec la période précédente" />
        </section>
      ) : null}

      {advisors.status === "success" && advisors.data.length > 0 ? (
        <Card title="Performance par conseiller">
          <DataTable
            columns={[
              { key: "advisor", header: "Conseiller", render: (row) => advisorDisplayName(teamMembers, row.advisorId) },
              { key: "received", header: "Reçus", numeric: true, align: "right", render: (row) => row.received },
              { key: "accepted", header: "Acceptés", numeric: true, align: "right", render: (row) => row.accepted },
              { key: "won", header: "Gagnés", numeric: true, align: "right", render: (row) => row.won },
              { key: "lost", header: "Perdus", numeric: true, align: "right", render: (row) => row.lost },
              { key: "conversion", header: "Conversion", numeric: true, align: "right", render: (row) => `${Math.round(row.conversionRate * 100)}%` },
              {
                key: "firstAction",
                header: "Première action",
                numeric: true,
                align: "right",
                render: (row) => (row.averageFirstActionMinutes === null ? "-" : `${row.averageFirstActionMinutes} min`)
              }
            ]}
            items={advisors.data}
            getKey={(row) => row.advisorId}
            aria-label="Performance par conseiller"
            emptyLabel="Aucun conseiller mesuré."
            dense
          />
        </Card>
      ) : null}

      {statement.status === "success" ? (
        <section aria-label="Consommation et facturation" className="bo-stack">
          <div className={styles.sectionHead}>
            <h2 className="bo-section-title">Consommation et facturation</h2>
            <Button href="/billing" variant="secondary" size="sm">Voir les factures, le solde et les packs du cabinet</Button>
          </div>
          <StatStrip
            label="Consommation du mois"
            items={[
              { label: "Leads reçus (mois)", value: statement.data.leadsReceived },
              { label: "Leads facturés (brouillon)", value: statement.data.billableLeadCount, tone: "info" },
              { label: "Leads non facturables", value: statement.data.nonBillableLeadCount },
              { label: "Contestations créditées", value: statement.data.disputeCreditCount, tone: statement.data.disputeCreditCount > 0 ? "warning" : "neutral" },
              { label: "Crédits pack restants", value: statement.data.packCreditsRemaining },
              { label: "Montant estimé", value: `${statement.data.estimatedAmount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} ${statement.data.currency}`, helper: "Estimation indicative" }
            ]}
          />
          <Cluster>
            <Badge tone={statement.data.billingEnabled ? "info" : "disabled"}>{statement.data.billingEnabled ? "Facturation active" : "Facturation inactive"}</Badge>
            <Badge tone="disabled">Paiement en ligne désactivé</Badge>
            {statement.data.draft ? <Badge tone="disabled">{draftStatusLabel(statement.data.draft.status)}</Badge> : null}
            <span className={styles.muted}>{statement.data.notice || "Brouillon non facturable: estimation du mois en cours, aucun encaissement en ligne."}</span>
          </Cluster>
        </section>
      ) : null}

      <AiInsightsPanel
        profile={session.profile}
        assistance={aiAssistance.status === "success" ? aiAssistance.data : undefined}
        optedOut={aiOptOut.status === "success" && aiOptOut.data.optedOut}
        notice={insightNotice}
      />

      {aiAssistance.status === "success" ? (
        <Card title="Assistance IA">
          <DescriptionList
            columns={2}
            items={[
              { term: "Assistance", value: <Badge tone={aiAssistance.data.enabled ? "success" : "disabled"}>{aiAssistance.data.enabled ? "Activée" : "Désactivée"}</Badge> },
              { term: "Appel à un modèle", value: <Badge tone={aiAssistance.data.modelCall ? "info" : "disabled"}>{aiAssistance.data.modelCall ? "Oui" : "Non"}</Badge> },
              { term: "Décision", value: <Badge tone="warning">validation humaine obligatoire</Badge> }
            ]}
          />
          <p className={styles.muted}>{aiAssistance.data.message}</p>
          {aiOptOut.status === "success" ? (
            <TenantWriteGuard readOnly={isTenantReadOnly(session.profile)}>
              {aiOptOut.data.optedOut ? (
                <form action={setAiOptOutAction}>
                  <input type="hidden" name="optOut" value="false" />
                  <input type="hidden" name="reason" value="Réactivation de l'assistance IA par le cabinet" />
                  <Cluster>
                    <Badge tone="warning">Cabinet en opt-out IA</Badge>
                    <Button type="submit" variant="secondary" size="sm">Réactiver l&apos;assistance IA</Button>
                  </Cluster>
                </form>
              ) : (
                <Cluster>
                  <Badge tone="neutral">Assistance IA autorisée pour le cabinet</Badge>
                  {/* Refusing hides every AI suggestion for the whole cabinet: it is confirmed first (the action itself is unchanged). */}
                  <ConfirmDialog
                    triggerLabel="Refuser l'assistance IA (opt-out cabinet)"
                    title="Refuser l'assistance IA pour le cabinet ?"
                    description="Les suggestions IA seront masquées pour tous les utilisateurs du cabinet. Vous pourrez la réactiver à tout moment ; le choix est historisé. Réservé au propriétaire du cabinet."
                    confirmLabel="Refuser l'assistance IA"
                    cancelLabel="Annuler"
                    formAction={setAiOptOutAction}
                  >
                    <input type="hidden" name="optOut" value="true" />
                    <input type="hidden" name="reason" value="Opt-out de l'assistance IA par le cabinet" />
                  </ConfirmDialog>
                </Cluster>
              )}
            </TenantWriteGuard>
          ) : null}
          {aiNotice === "optout_saved" ? <Notice tone="success">Préférence IA du cabinet enregistrée et auditée.</Notice> : null}
          {aiNotice === "suspended" ? <Notice tone="warning">{TENANT_SUSPENDED_MESSAGE}</Notice> : null}
          {aiNotice === "forbidden" ? <Notice tone="danger">Seul le propriétaire du cabinet peut modifier la préférence IA.</Notice> : null}
        </Card>
      ) : null}
    </PageStack>
  );
}
