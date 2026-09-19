import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import { isNotFoundState, listLeadAiInteractions, readBrokerAIAssistance, readCrmLeadDetail } from "../../../lib/broker-api";
import { canMutateCrmLead } from "../../../lib/broker-permissions";
import { addCrmLeadNoteAction, addCrmLeadReminderAction, addCrmLeadTaskAction, changeCrmLeadStatusAction } from "../../../lib/lead-actions";
import {
  CRM_OUTCOME_REASONS,
  CRM_PIPELINE_STATUSES,
  CRM_REASON_LABELS,
  CRM_REASON_REQUIRED_STATUSES,
  CRM_STATUS_LABELS,
  crmEventLabel,
  crmReasonLabel,
  crmStatusLabel,
  renderAnswerValue
} from "../../../lib/lead-vocabulary";
import { Badge, Card, PageHeader, StateMessage } from "../../../lib/ui/broker-ui";
import { formatDate } from "../../../lib/ui/broker-view-models";
import { LeadAiPanel } from "./lead-ai-panel";

const NOTICES: Record<string, { tone: "info" | "warning" | "danger"; message: string }> = {
  status_changed: { tone: "info", message: "Statut du lead mis a jour et historise." },
  note_created: { tone: "info", message: "Note interne ajoutee. Elle reste invisible cote Web Publique Client." },
  task_created: { tone: "info", message: "Tache commerciale creee pour votre cabinet." },
  reminder_created: { tone: "info", message: "Rappel programme pour votre cabinet." },
  reason_required: { tone: "warning", message: "Un motif allowliste est obligatoire pour un statut de perte ou de contestation." },
  forbidden: { tone: "warning", message: "Action refusee par vos permissions CRM, votre tenant ou votre MFA." },
  not_found: { tone: "warning", message: "Ce lead n'existe pas ou n'est pas accessible pour votre cabinet." },
  invalid: { tone: "warning", message: "Saisie refusee par l'API. Verifiez les champs obligatoires." },
  error: { tone: "danger", message: "Action CRM indisponible pour le moment. Aucun changement n'a ete enregistre." }
};

function textOf(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

export default async function BrokerCrmLeadDetailPage({ params, searchParams }: { params: Promise<{ leadAssignmentId: string }>; searchParams: Promise<{ ai?: string; crm?: string }> }) {
  const { leadAssignmentId } = await params;
  const { ai, crm } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="CRM Pro/Enterprise"
          title="Acces CRM refuse"
          description="Le detail CRM exige un plan Pro/Enterprise, la MFA verifiee, le flag broker_crm_enabled et les permissions CRM."
        />
        <StateMessage tone="info">Le CRM complet est disponible avec le plan Pro.</StateMessage>
      </div>
    );
  }

  const [detail, assistance, interactions] = await Promise.all([readCrmLeadDetail(leadAssignmentId), readBrokerAIAssistance(), listLeadAiInteractions(leadAssignmentId)]);
  if (detail.unauthenticated) redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, detail.error ?? "session_required"));
  const lead = detail.status === "success" ? detail.data : undefined;
  const notFound = isNotFoundState(detail);
  const canMutate = canMutateCrmLead(session.profile);
  const showForms = Boolean(lead) && canMutate;
  const noticeEntry = crm ? NOTICES[crm] : undefined;
  const notes = lead?.notes ?? [];
  const tasks = lead?.tasks ?? [];
  const reminders = lead?.reminders ?? [];
  const history = lead?.history ?? [];
  const reasonRequiredLabels = CRM_REASON_REQUIRED_STATUSES.map((status) => CRM_STATUS_LABELS[status]).join(", ");

  return (
    <div className="page-stack">
      <a href="/crm/leads">Retour aux leads CRM</a>
      <PageHeader
        kicker="CRM Pro/Enterprise"
        title={lead?.publicReference || "Lead CRM"}
        description="Detail CRM interne. Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client."
        actions={<Badge tone="success">CRM autorise</Badge>}
      />

      {noticeEntry ? <StateMessage tone={noticeEntry.tone}>{noticeEntry.message}</StateMessage> : null}
      {detail.status === "forbidden" ? <StateMessage tone="warning" title="Acces refuse">Ce lead n'est pas accessible avec vos permissions CRM ou votre tenant.</StateMessage> : null}
      {notFound ? <StateMessage tone="warning" title="Lead introuvable">Aucun lead CRM ne correspond a cette reference pour votre cabinet.</StateMessage> : null}
      {detail.status === "error" && !notFound ? <StateMessage tone="warning" title="Lead indisponible">{detail.error ?? "erreur inconnue"}</StateMessage> : null}
      {lead && !canMutate ? (
        <StateMessage tone="info" title="Lecture seule">
          Votre role CRM ne permet pas de modifier ce lead. Statut, notes, taches et rappels restent consultables uniquement.
        </StateMessage>
      ) : null}

      <section className="split-layout">
        <div className="page-stack">
          <Card plain>
            <h2 className="section-title">Pipeline</h2>
            <div className="inline-cluster">
              {CRM_PIPELINE_STATUSES.map((status) => (
                <Badge key={status} tone={lead && status === lead.status ? "info" : "neutral"}>{CRM_STATUS_LABELS[status]}</Badge>
              ))}
            </div>
            {lead ? (
              <dl className="definition-list">
                <dt>Statut</dt><dd>{crmStatusLabel(lead.status)}</dd>
                <dt>Exclusivite</dt>
                <dd>
                  {lead.isShared
                    ? `Lead partage avec ${(lead.recipientCount ?? 2) - 1} autre(s) courtier(s) partenaire(s), au tarif reduit. L'identite des autres courtiers n'est pas communiquee.`
                    : "Lead exclusif: vous etes le seul courtier partenaire destinataire."}
                </dd>
                <dt>Pays / produit</dt><dd>{lead.countryCode} / {lead.productKey}</dd>
                <dt>Urgence</dt><dd>{lead.urgency}</dd>
                <dt>Source</dt><dd>{lead.source}</dd>
                <dt>Recu le</dt><dd>{formatDate(lead.assignedAt)}</dd>
                <dt>Conseiller</dt><dd>{lead.advisorId ?? "Non assigne"}</dd>
                <dt>Contact</dt><dd>{[lead.prospectName, lead.emailMasked, lead.phoneMasked].filter(Boolean).join(" - ") || "Masque"}</dd>
              </dl>
            ) : null}
          </Card>

          {showForms && lead ? (
            <Card plain>
              <h2 className="section-title">Changer le statut</h2>
              <form action={changeCrmLeadStatusAction} className="form-grid">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <label className="field">
                  Nouveau statut
                  <select name="status" required defaultValue={lead.status} aria-label="Nouveau statut du lead">
                    {CRM_PIPELINE_STATUSES.map((status) => (
                      <option key={status} value={status}>{CRM_STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Motif
                  <select name="reason" defaultValue="" aria-label="Motif de sortie du pipeline">
                    <option value="">Aucun motif</option>
                    {CRM_OUTCOME_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{CRM_REASON_LABELS[reason]}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="button">Enregistrer le statut</button>
              </form>
              <p className="page-description">
                Un motif allowliste est obligatoire pour les statuts suivants: {reasonRequiredLabels}. Le changement de statut est historise avec acteur, date et motif.
              </p>
            </Card>
          ) : null}

          {lead && Object.keys(lead.answers).length > 0 ? (
            <Card plain>
              <h2 className="section-title">Reponses consenties</h2>
              <dl className="definition-list">
                {Object.entries(lead.answers).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{renderAnswerValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          <Card plain>
            <h2 className="section-title">Notes internes</h2>
            {notes.length > 0 ? (
              <ul className="simple-list">
                {notes.map((note, index) => (
                  <li key={textOf(note, "id") || `note-${index}`}>
                    {formatDate(textOf(note, "createdAt"))} - {textOf(note, "body")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="page-description">Aucune note interne pour ce lead.</p>
            )}
            {showForms && lead ? (
              <form action={addCrmLeadNoteAction} className="form-grid">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <label className="field">
                  Note interne
                  <input name="body" maxLength={1000} required placeholder="Suivi commercial interne" aria-label="Contenu de la note interne" />
                </label>
                <button type="submit" className="button button--secondary">Ajouter une note</button>
              </form>
            ) : null}
          </Card>

          <Card plain>
            <h2 className="section-title">Taches commerciales</h2>
            {tasks.length > 0 ? (
              <ul className="simple-list">
                {tasks.map((task, index) => (
                  <li key={textOf(task, "id") || `task-${index}`}>
                    {textOf(task, "title")}
                    {task.dueAt ? ` - echeance ${formatDate(textOf(task, "dueAt"))}` : ""}
                    {task.completedAt ? " - terminee" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="page-description">Aucune tache commerciale pour ce lead.</p>
            )}
            {showForms && lead ? (
              <form action={addCrmLeadTaskAction} className="form-grid">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <label className="field">
                  Intitule
                  <input name="title" maxLength={200} required placeholder="Rappeler le prospect" aria-label="Intitule de la tache" />
                </label>
                <label className="field">
                  Echeance
                  <input type="datetime-local" name="dueAt" aria-label="Echeance de la tache" />
                </label>
                <button type="submit" className="button button--secondary">Ajouter une tache</button>
              </form>
            ) : null}
          </Card>

          <Card plain>
            <h2 className="section-title">Rappels</h2>
            {reminders.length > 0 ? (
              <ul className="simple-list">
                {reminders.map((reminder, index) => (
                  <li key={textOf(reminder, "id") || `reminder-${index}`}>
                    {formatDate(textOf(reminder, "remindAt"))}
                    {reminder.message ? ` - ${textOf(reminder, "message")}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="page-description">Aucun rappel programme pour ce lead.</p>
            )}
            {showForms && lead ? (
              <form action={addCrmLeadReminderAction} className="form-grid">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <label className="field">
                  Date du rappel
                  <input type="datetime-local" name="remindAt" required aria-label="Date du rappel" />
                </label>
                <label className="field">
                  Message
                  <input name="message" maxLength={500} placeholder="Optionnel" aria-label="Message du rappel" />
                </label>
                <button type="submit" className="button button--secondary">Ajouter un rappel</button>
              </form>
            ) : null}
          </Card>

          <Card plain>
            <h2 className="section-title">Historique CRM</h2>
            {history.length > 0 ? (
              <ol className="simple-list">
                {history.map((event, index) => (
                  <li key={textOf(event, "id") || `event-${index}`}>
                    {formatDate(textOf(event, "occurredAt"))} - {crmEventLabel(textOf(event, "eventType"))}
                    {event.previousStatus || event.nextStatus
                      ? ` (${crmStatusLabel(textOf(event, "previousStatus"))} -> ${crmStatusLabel(textOf(event, "nextStatus"))})`
                      : ""}
                    {event.reason ? ` - motif: ${crmReasonLabel(textOf(event, "reason"))}` : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="page-description">Aucun evenement CRM historise pour ce lead.</p>
            )}
          </Card>

          <Card plain>
            <h2 className="section-title">Documents et references</h2>
            <p className="page-description">
              Les propositions ou references de devis sont un suivi interne partenaire, pas une emission contractuelle par AssurMatch.
            </p>
            <div className="inline-cluster">
              <Badge>Document interne ({lead?.documents.length ?? 0})</Badge>
              <Badge>Document prospect</Badge>
              <Badge>Reference devis ({lead?.proposals.length ?? 0})</Badge>
            </div>
          </Card>

          <LeadAiPanel
            leadAssignmentId={leadAssignmentId}
            enabled={assistance.status === "success" && assistance.data.enabled && Boolean(lead)}
            availableAssistTypes={assistance.data.availableAssistTypes}
            interactions={interactions.status === "success" ? interactions.data : []}
            notice={ai}
          />
        </div>

        <Card plain>
          <h2 className="section-title">Controle d'acces</h2>
          <ul className="simple-list">
            <li>Owner: organisation.</li>
            <li>Manager: equipe ou organisation selon permission.</li>
            <li>Agent: leads assignes.</li>
            <li>Read-only: lecture seule.</li>
          </ul>
          <p className="page-description">
            Les formulaires ne sont proposes que si votre role autorise la mise a jour CRM. Le backend re-verifie chaque action et audite les refus.
          </p>
        </Card>
      </section>
    </div>
  );
}
