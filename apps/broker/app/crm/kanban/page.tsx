import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readCrmKanban } from "../../lib/broker-api";
import { CRM_PIPELINE_STATUSES, CRM_STATUS_LABELS } from "../../lib/lead-vocabulary";
import { Badge, Card, Notice, PageHeader, PageStack } from "../../lib/ui/broker-ui";
import { leadSummary } from "../../lib/ui/broker-view-models";

/**
 * Spec 055 FR-010: vue Kanban du CRM Pro/Enterprise (GET /broker/crm/leads/kanban). Une colonne par
 * statut pipeline ; chaque carte ouvre la fiche CRM. Lecture seule : le statut se change depuis la
 * fiche, avec motif et historique. Jamais proposee au plan Starter (constitution 1.3.0).
 */
export default async function BrokerCrmKanbanPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm/kanban", session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue Kanban" }]} kicker="CRM Pro/Enterprise" title="Acces CRM refuse" description="La vue Kanban exige un plan Pro/Enterprise, la MFA verifiee et les permissions CRM." />
        <Notice tone="info">Le CRM complet est disponible avec le plan Pro.</Notice>
      </PageStack>
    );
  }
  const kanban = await readCrmKanban();
  if (kanban.unauthenticated) redirect(loginRedirect("/crm/kanban", kanban.error ?? "session_required"));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue Kanban" }]}
        kicker="CRM Pro/Enterprise"
        title="Vue Kanban"
        description="Leads autorises regroupes par statut pipeline, selon votre role, votre tenant et votre conseiller."
        actions={<Badge tone="info">Lecture : changez le statut depuis la fiche</Badge>}
      />
      {kanban.forbidden ? <Notice tone="danger" title="Acces CRM refuse">Verifiez le plan, la MFA et le flag broker_crm_enabled. Aucune donnee CRM n'est affichee.</Notice> : null}
      {kanban.status === "error" ? <Notice tone="warning">Vue Kanban temporairement indisponible.</Notice> : null}
      {kanban.status === "success" ? (
        <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(220px, 1fr)", gap: "var(--bo-space-4, 16px)", overflowX: "auto" }} aria-label="Colonnes du pipeline CRM">
          {CRM_PIPELINE_STATUSES.map((status) => {
            const leads = (kanban.data[status] ?? []).map(leadSummary);
            return (
              <Card key={status} title={`${CRM_STATUS_LABELS[status]} (${leads.length})`} as="section">
                {leads.length > 0 ? (
                  <ul>
                    {leads.map((lead) => (
                      <li key={lead.id}>
                        <a href={`/crm/leads/${lead.id}`}>{lead.reference}</a> - {lead.product} / {lead.country}
                        {lead.advisor ? ` - ${lead.advisor}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucun lead.</p>
                )}
              </Card>
            );
          })}
        </div>
      ) : null}
    </PageStack>
  );
}
