import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readCrmKanban } from "../../lib/broker-api";
import { CRM_PIPELINE_STATUSES, CRM_STATUS_LABELS } from "../../lib/lead-vocabulary";
import { Badge, Button, Notice, PageHeader, PageStack } from "../../lib/ui/broker-ui";
import { leadSummary } from "../../lib/ui/broker-view-models";
import styles from "../../lib/ui/broker-screens.module.css";

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
        <PageHeader breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue Kanban" }]} title="Acces CRM refuse" description="La vue Kanban exige un plan Pro/Enterprise, la MFA verifiee et les permissions CRM." />
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
        title="Vue Kanban"
        description="Leads autorises regroupes par statut pipeline. Lecture : changez le statut depuis la fiche du lead, avec motif et historique."
        actions={<Button href="/crm/leads" variant="secondary">Vue tableau</Button>}
      />
      {kanban.forbidden ? <Notice tone="danger" title="Acces CRM refuse">Verifiez le plan, la MFA et le flag broker_crm_enabled. Aucune donnee CRM n'est affichee.</Notice> : null}
      {kanban.status === "error" ? <Notice tone="warning">Vue Kanban temporairement indisponible.</Notice> : null}
      {kanban.status === "success" ? (
        <div className={styles.board} role="region" aria-label="Colonnes du pipeline CRM" tabIndex={0}>
          {CRM_PIPELINE_STATUSES.map((status) => {
            const leads = (kanban.data[status] ?? []).map(leadSummary);
            return (
              <section key={status} className={styles.column} aria-label={`${CRM_STATUS_LABELS[status]} (${leads.length})`}>
                <h2 className={styles.columnHead}>
                  <span>{CRM_STATUS_LABELS[status]}</span>
                  <Badge tone={leads.length > 0 ? "info" : "neutral"}>{String(leads.length)}</Badge>
                </h2>
                {leads.length > 0 ? (
                  <ul className={styles.columnList}>
                    {leads.map((lead) => (
                      <li key={lead.id} className={styles.ticket}>
                        <a className="bo-ref" href={`/crm/leads/${lead.id}`}>{lead.reference}</a>
                        <span>{lead.product} / {lead.country}</span>
                        {lead.advisor ? <span className={styles.entryMeta}>Conseiller <span className="bo-ref">{lead.advisor}</span></span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.columnEmpty}>Aucun lead.</p>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </PageStack>
  );
}
