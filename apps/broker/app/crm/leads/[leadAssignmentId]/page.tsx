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
import {
  Badge,
  Button,
  Card,
  Cluster,
  DescriptionList,
  Field,
  Form,
  FormActions,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Select,
  Split,
  Stack,
  Tabs
} from "../../../lib/ui/broker-ui";
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

/** Onglets de la fiche CRM: chaque onglet est une vraie navigation, donc une URL partageable. */
const TABS = [
  { key: "synthese", label: "Synthese" },
  { key: "activite", label: "Activite" },
  { key: "historique", label: "Historique" }
] as const;

type TabKey = (typeof TABS)[number]["key"];

function textOf(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

export default async function BrokerCrmLeadDetailPage({ params, searchParams }: { params: Promise<{ leadAssignmentId: string }>; searchParams: Promise<{ ai?: string; crm?: string; tab?: string }> }) {
  const { leadAssignmentId } = await params;
  const { ai, crm, tab } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue tableau", href: "/crm/leads" }, { label: "Detail" }]}
          kicker="CRM Pro/Enterprise"
          title="Acces CRM refuse"
          description="Le detail CRM exige un plan Pro/Enterprise, la MFA verifiee, le flag broker_crm_enabled et les permissions CRM."
        />
        <Notice tone="info">Le CRM complet est disponible avec le plan Pro.</Notice>
      </PageStack>
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
  const currentTab: TabKey = TABS.some((item) => item.key === tab) ? (tab as TabKey) : "synthese";
  const tabHref = (key: TabKey) => (key === "synthese" ? `/crm/leads/${leadAssignmentId}` : `/crm/leads/${leadAssignmentId}?tab=${key}`);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue tableau", href: "/crm/leads" }, { label: lead?.publicReference || "Lead CRM" }]}
        kicker="CRM Pro/Enterprise"
        title={lead?.publicReference || "Lead CRM"}
        description="Detail CRM interne. Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client."
        actions={
          <Cluster>
            <Badge tone="success">CRM autorise</Badge>
            <Button href="/crm/leads" variant="secondary" size="sm">Retour aux leads CRM</Button>
          </Cluster>
        }
      />

      {noticeEntry ? <Notice tone={noticeEntry.tone}>{noticeEntry.message}</Notice> : null}
      {detail.status === "forbidden" ? <Notice tone="warning" title="Acces refuse">Ce lead n'est pas accessible avec vos permissions CRM ou votre tenant.</Notice> : null}
      {notFound ? <Notice tone="warning" title="Lead introuvable">Aucun lead CRM ne correspond a cette reference pour votre cabinet.</Notice> : null}
      {detail.status === "error" && !notFound ? <Notice tone="warning" title="Lead indisponible">{detail.error ?? "erreur inconnue"}</Notice> : null}
      {lead && !canMutate ? (
        <Notice tone="info" title="Lecture seule">
          Votre role CRM ne permet pas de modifier ce lead. Statut, notes, taches et rappels restent consultables uniquement.
        </Notice>
      ) : null}

      <Tabs
        label="Sections de la fiche CRM"
        items={TABS.map((item) => ({ label: item.label, href: tabHref(item.key), current: item.key === currentTab }))}
      />

      <Split>
        <Stack>
          {currentTab === "synthese" ? (
            <>
              <Card title="Pipeline">
                <Cluster>
                  {CRM_PIPELINE_STATUSES.map((status) => (
                    <Badge key={status} tone={lead && status === lead.status ? "info" : "neutral"}>{CRM_STATUS_LABELS[status]}</Badge>
                  ))}
                </Cluster>
                {lead ? (
                  <DescriptionList
                    items={[
                      { term: "Statut", value: crmStatusLabel(lead.status) },
                      {
                        term: "Exclusivite",
                        value: lead.isShared
                          ? `Lead partage avec ${(lead.recipientCount ?? 2) - 1} autre(s) courtier(s) partenaire(s), au tarif reduit. L'identite des autres courtiers n'est pas communiquee.`
                          : "Lead exclusif: vous etes le seul courtier partenaire destinataire."
                      },
                      { term: "Pays / produit", value: `${lead.countryCode} / ${lead.productKey}` },
                      { term: "Urgence", value: lead.urgency },
                      { term: "Source", value: lead.source },
                      { term: "Recu le", value: formatDate(lead.assignedAt) },
                      { term: "Conseiller", value: lead.advisorId ?? "Non assigne" },
                      { term: "Contact", value: [lead.prospectName, lead.emailMasked, lead.phoneMasked].filter(Boolean).join(" - ") || "Masque" }
                    ]}
                  />
                ) : null}
              </Card>

              {showForms && lead ? (
                <Card title="Changer le statut">
                  <Form action={changeCrmLeadStatusAction} columns={2}>
                    <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                    <Field id="crm-new-status" label="Nouveau statut" required requiredLabel="obligatoire">
                      <Select
                        id="crm-new-status"
                        name="status" required
                        defaultValue={lead.status}
                        aria-label="Nouveau statut du lead"
                        options={CRM_PIPELINE_STATUSES.map((status) => ({ value: status, label: CRM_STATUS_LABELS[status] }))}
                      />
                    </Field>
                    <Field id="crm-status-reason" label="Motif">
                      <Select
                        id="crm-status-reason"
                        name="reason"
                        defaultValue=""
                        aria-label="Motif de sortie du pipeline"
                        options={[
                          { value: "", label: "Aucun motif" },
                          ...CRM_OUTCOME_REASONS.map((reason) => ({ value: reason, label: CRM_REASON_LABELS[reason] }))
                        ]}
                      />
                    </Field>
                    <FormActions>
                      <Button type="submit">Enregistrer le statut</Button>
                    </FormActions>
                  </Form>
                  <p>
                    Un motif allowliste est obligatoire pour les statuts suivants: {reasonRequiredLabels}. Le changement de statut est historise avec acteur, date et motif.
                  </p>
                </Card>
              ) : null}

              {lead && Object.keys(lead.answers).length > 0 ? (
                <Card title="Reponses consenties">
                  <DescriptionList>
                    {Object.entries(lead.answers).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{renderAnswerValue(value)}</dd>
                      </div>
                    ))}
                  </DescriptionList>
                </Card>
              ) : null}
            </>
          ) : null}

          {currentTab === "activite" ? (
            <>
              <Card title="Notes internes">
                {notes.length > 0 ? (
                  <ul>
                    {notes.map((note, index) => (
                      <li key={textOf(note, "id") || `note-${index}`}>
                        {formatDate(textOf(note, "createdAt"))} - {textOf(note, "body")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucune note interne pour ce lead.</p>
                )}
                {showForms && lead ? (
                  <Form action={addCrmLeadNoteAction}>
                    <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                    <Field id="crm-note-body" label="Note interne" required requiredLabel="obligatoire">
                      <Input
                        id="crm-note-body"
                        name="body"
                        maxLength={1000}
                        required
                        placeholder="Suivi commercial interne"
                        aria-label="Contenu de la note interne"
                      />
                    </Field>
                    <FormActions>
                      <Button type="submit" variant="secondary">Ajouter une note</Button>
                    </FormActions>
                  </Form>
                ) : null}
              </Card>

              <Card title="Taches commerciales">
                {tasks.length > 0 ? (
                  <ul>
                    {tasks.map((task, index) => (
                      <li key={textOf(task, "id") || `task-${index}`}>
                        {textOf(task, "title")}
                        {task.dueAt ? ` - echeance ${formatDate(textOf(task, "dueAt"))}` : ""}
                        {task.completedAt ? " - terminee" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucune tache commerciale pour ce lead.</p>
                )}
                {showForms && lead ? (
                  <Form action={addCrmLeadTaskAction} columns={2}>
                    <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                    <Field id="crm-task-title" label="Intitule" required requiredLabel="obligatoire">
                      <Input id="crm-task-title" name="title" maxLength={200} required placeholder="Rappeler le prospect" aria-label="Intitule de la tache" />
                    </Field>
                    <Field id="crm-task-due" label="Echeance">
                      <Input id="crm-task-due" type="datetime-local" name="dueAt" aria-label="Echeance de la tache" />
                    </Field>
                    <FormActions>
                      <Button type="submit" variant="secondary">Ajouter une tache</Button>
                    </FormActions>
                  </Form>
                ) : null}
              </Card>

              <Card title="Rappels">
                {reminders.length > 0 ? (
                  <ul>
                    {reminders.map((reminder, index) => (
                      <li key={textOf(reminder, "id") || `reminder-${index}`}>
                        {formatDate(textOf(reminder, "remindAt"))}
                        {reminder.message ? ` - ${textOf(reminder, "message")}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucun rappel programme pour ce lead.</p>
                )}
                {showForms && lead ? (
                  <Form action={addCrmLeadReminderAction} columns={2}>
                    <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                    <Field id="crm-reminder-at" label="Date du rappel" required requiredLabel="obligatoire">
                      <Input id="crm-reminder-at" type="datetime-local" name="remindAt" required aria-label="Date du rappel" />
                    </Field>
                    <Field id="crm-reminder-message" label="Message">
                      <Input id="crm-reminder-message" name="message" maxLength={500} placeholder="Optionnel" aria-label="Message du rappel" />
                    </Field>
                    <FormActions>
                      <Button type="submit" variant="secondary">Ajouter un rappel</Button>
                    </FormActions>
                  </Form>
                ) : null}
              </Card>

              <LeadAiPanel
                leadAssignmentId={leadAssignmentId}
                enabled={assistance.status === "success" && assistance.data.enabled && Boolean(lead)}
                availableAssistTypes={assistance.data.availableAssistTypes}
                interactions={interactions.status === "success" ? interactions.data : []}
                notice={ai}
              />
            </>
          ) : null}

          {currentTab === "historique" ? (
            <>
              <Card title="Historique CRM">
                {history.length > 0 ? (
                  <ol>
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
                  <p>Aucun evenement CRM historise pour ce lead.</p>
                )}
              </Card>

              <Card title="Documents et references">
                <p>
                  Les propositions ou references de devis sont un suivi interne partenaire, pas une emission contractuelle par AssurMatch.
                </p>
                <Cluster>
                  <Badge>Document interne ({lead?.documents.length ?? 0})</Badge>
                  <Badge>Document prospect</Badge>
                  <Badge>Reference devis ({lead?.proposals.length ?? 0})</Badge>
                </Cluster>
              </Card>
            </>
          ) : null}
        </Stack>

        <Card title="Controle d'acces">
          <ul>
            <li>Owner: organisation.</li>
            <li>Manager: equipe ou organisation selon permission.</li>
            <li>Agent: leads assignes.</li>
            <li>Read-only: lecture seule.</li>
          </ul>
          <p>
            Les formulaires ne sont proposes que si votre role autorise la mise a jour CRM. Le backend re-verifie chaque action et audite les refus.
          </p>
        </Card>
      </Split>
    </PageStack>
  );
}
