import { redirect } from "next/navigation";
import { AGENCY_PARAM, agencyQuery } from "../../lib/agency-filter";
import { loadAgencyFilter } from "../../lib/agency-filter-loader";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readBrokerTeam, readCrmKanban } from "../../lib/broker-api";
import { canMutateCrmLead, isTenantReadOnly } from "../../lib/broker-permissions";
import { kanbanMovesEnabled } from "../../lib/kanban-moves";
import { CRM_PIPELINE_STATUSES } from "../../lib/lead-vocabulary";
import { advisorDisplayName } from "../../lib/team-options";
import { AgencyFilterForm } from "../../lib/ui/agency-filter-form";
import { Badge, Notice, PageHeader, PageStack } from "../../lib/ui/broker-ui";
import { leadSummary } from "../../lib/ui/broker-view-models";
import { KanbanBoard } from "./kanban-board";
import type { KanbanCardData } from "./kanban-board";

/**
 * Spec 055 FR-010: vue Kanban du CRM Pro/Enterprise (GET /broker/crm/leads/kanban). Une colonne par
 * statut pipeline ; chaque carte ouvre la fiche CRM et se deplace entre colonnes (glisser-deposer ou
 * menu clavier) pour les roles autorises ; un motif allowliste est exige pour les statuts de sortie.
 * L'API reste l'autorite : elle audite chaque changement et refuse les roles sans droit.
 * Jamais proposee au plan Starter (constitution 1.3.0).
 */
export default async function BrokerCrmKanbanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm/kanban", session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue Kanban" }]} kicker="CRM Pro/Enterprise" title="Accès CRM refusé" description="La vue Kanban exige un plan Pro/Enterprise, la MFA vérifiée et les permissions CRM." />
        <Notice tone="info">Le CRM complet est disponible avec le plan Pro.</Notice>
      </PageStack>
    );
  }
  // Spec 064: Enterprise agency DISPLAY filter (no access restriction); other plans make no extra API call.
  const agency = await loadAgencyFilter(session.profile, params[AGENCY_PARAM]);
  const [kanban, team] = await Promise.all([readCrmKanban(agencyQuery(agency)), readBrokerTeam()]);
  if (kanban.unauthenticated) redirect(loginRedirect("/crm/kanban", kanban.error ?? "session_required"));

  const canMove = kanbanMovesEnabled(canMutateCrmLead(session.profile), isTenantReadOnly(session.profile));
  // The team read is best effort (a role without team right gets 403): "Conseiller hors équipe" is the fallback.
  const members = team.status === "success" ? team.data : [];
  const columns: Record<string, KanbanCardData[]> = {};
  if (kanban.status === "success") {
    for (const status of CRM_PIPELINE_STATUSES) {
      columns[status] = (kanban.data[status] ?? []).map((raw) => {
        const lead = leadSummary(raw);
        return { id: lead.id, reference: lead.reference, product: lead.product, country: lead.country, advisor: lead.advisor ? advisorDisplayName(members, lead.advisor) : undefined };
      });
    }
  }

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue Kanban" }]}
        title="Vue Kanban"
        description="Leads autorisés regroupés par statut du pipeline, selon votre rôle, votre cabinet et votre conseiller."
        actions={<Badge tone="info">{canMove ? "Glissez une carte pour changer son statut" : "Lecture seule"}</Badge>}
      />
      <AgencyFilterForm action="/crm/kanban" filter={agency} fieldId="kanban-agency" />
      {kanban.forbidden ? <Notice tone="danger" title="Accès CRM refusé">Vérifiez le plan, la MFA et les permissions CRM. Aucune donnée CRM n'est affichée.</Notice> : null}
      {kanban.status === "error" ? <Notice tone="warning">Vue Kanban temporairement indisponible.</Notice> : null}
      {kanban.status === "success" ? <KanbanBoard columns={columns} canMove={canMove} /> : null}
    </PageStack>
  );
}
