import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import { isNotFoundState, listLeadAiInteractions, readBrokerTeam, readBrokerAIAssistance, readCrmLeadDetail, readLeadProposals } from "../../../lib/broker-api";
import { TENANT_SUSPENDED_MESSAGE, canAssignCrmLead, canMutateCrmLead, isTenantReadOnly } from "../../../lib/broker-permissions";
import { addCrmLeadNoteAction, addCrmLeadReminderAction, addCrmLeadTaskAction, changeCrmLeadStatusAction, disputeCrmLeadAction } from "../../../lib/lead-actions";
import { assignCrmAdvisorAction } from "../../../lib/proposal-actions";
import { advisorDisplayName, teamAdvisorOptions } from "../../../lib/team-options";
import { CRM_SOURCE_LABELS, CRM_URGENCY_LABELS } from "../../../lib/crm-list-query";
import { productLabel } from "../../../lib/product-vocabulary";
import { PROPOSAL_NOTICES } from "../../../lib/proposal-vocabulary";
import { ProposalPanel } from "../../../lib/ui/proposal-panel";
import { LeadConversationSection } from "../../../lib/ui/conversation-panel";
import {
  CRM_OUTCOME_REASONS,
  CRM_PIPELINE_STATUSES,
  CRM_REASON_LABELS,
  CRM_REASON_REQUIRED_STATUSES,
  CRM_STATUS_LABELS,
  crmEventLabel,
  crmReasonLabel,
  crmStatusLabel,
  DISPUTE_FINAL_DECISION_NOTICE,
  answerLabel,
  renderAnswerValue
} from "../../../lib/lead-vocabulary";
import {
  Badge,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
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
  StatusBadge,
  Tabs,
  TenantWriteGuard,
  crmStatusLabels
} from "../../../lib/ui/broker-ui";
import { DisputeStatusCard } from "../../../lib/ui/dispute-status-card";
import { disputeAvailability, formatDate, statusTone } from "../../../lib/ui/broker-view-models";
import styles from "../../../lib/ui/broker-screens.module.css";
import { LeadAiPanel } from "./lead-ai-panel";

const NOTICES: Record<string, { tone: "info" | "warning" | "danger"; message: string }> = {
  status_changed: { tone: "info", message: "Statut du lead mis à jour et historisé." },
  note_created: { tone: "info", message: "Note interne ajoutée. Elle reste invisible côté Web Publique Client." },
  task_created: { tone: "info", message: "Tâche commerciale créée pour votre cabinet." },
  reminder_created: { tone: "info", message: "Rappel programmé pour votre cabinet." },
  reason_required: { tone: "warning", message: "Un motif allowliste est obligatoire pour un statut de perte ou de contestation." },
  // Spec 063 (CRM-012): contestation d'un lead.
  disputed: { tone: "info", message: "Contestation enregistrée et historisée. La finance AssurMatch statuera ; vous serez notifié de la décision." },
  dispute_window_expired: { tone: "warning", message: "Contestation refusée : la fenêtre de 30 jours suivant la réception du lead est close." },
  dispute_exists: { tone: "warning", message: "Contestation refusée : ce lead a déjà fait l'objet d'une contestation." },
  forbidden: { tone: "warning", message: "Action refusée par vos permissions CRM, votre tenant ou votre MFA." },
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED.
  suspended: { tone: "warning", message: TENANT_SUSPENDED_MESSAGE },
  not_found: { tone: "warning", message: "Ce lead n'existe pas ou n'est pas accessible pour votre cabinet." },
  // Spec 055 FR-010: assignation conseiller et documents internes analyses par l'antivirus.
  assigned: { tone: "info", message: "Lead assigné au conseiller. Seul ce conseiller (et les managers) le voit parmi les agents." },
  document_added: { tone: "info", message: "Document interne ajouté après analyse antivirus. Il n'est jamais visible du visiteur." },
  quarantined: { tone: "danger", message: "Document refusé : il n'a pas passé l'antivirus et n'a pas été conservé." },
  document_invalid: { tone: "warning", message: "Document refusé : PDF, JPEG ou PNG de 5 Mo au maximum." },
  invalid: { tone: "warning", message: "Saisie refusée par l'API. Vérifiez les champs obligatoires." },
  error: { tone: "danger", message: "Action CRM indisponible pour le moment. Aucun changement n'a été enregistré." }
};

/** Onglets de la fiche CRM: chaque onglet est une vraie navigation, donc une URL partageable. */
const TABS = [
  { key: "synthese", label: "Synthèse" },
  { key: "propositions", label: "Propositions" },
  { key: "conversation", label: "Conversation" },
  { key: "activite", label: "Activité" },
  { key: "historique", label: "Historique" }
] as const;

const CONTACT_LABELS: Record<string, string> = {
  displayName: "Nom",
  fullName: "Nom",
  firstName: "Prénom",
  lastName: "Nom",
  email: "Email",
  emailMasked: "Email (masqué)",
  phone: "Téléphone",
  phoneMasked: "Téléphone (masqué)",
  preferredContactChannel: "Canal préféré",
  preferredContactTime: "Créneau préféré"
};

type TabKey = (typeof TABS)[number]["key"];

function textOf(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

export default async function BrokerCrmLeadDetailPage({ params, searchParams }: { params: Promise<{ leadAssignmentId: string }>; searchParams: Promise<{ ai?: string; crm?: string; tab?: string; proposal?: string; conv?: string }> }) {
  const { leadAssignmentId } = await params;
  const { ai, crm, tab, proposal, conv } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue tableau", href: "/crm/leads" }, { label: "Détail" }]}
          title="Accès CRM refusé"
          description="Le détail CRM exige un plan Pro/Enterprise, la MFA vérifiée, le flag broker_crm_enabled et les permissions CRM."
        />
        <Notice tone="info">Le CRM complet est disponible avec le plan Pro.</Notice>
      </PageStack>
    );
  }

  const [detail, assistance, interactions, proposals, team] = await Promise.all([readCrmLeadDetail(leadAssignmentId), readBrokerAIAssistance(), listLeadAiInteractions(leadAssignmentId), readLeadProposals("crm", leadAssignmentId), readBrokerTeam()]);
  // CRM-006: advisor picker and names come from the tenant team (GET /broker/team, tenant-scoped by the API).
  const teamMembers = team.status === "success" ? team.data : [];
  const teamAvailable = team.status === "success";
  const advisorOptions = teamAdvisorOptions(teamMembers);
  if (detail.unauthenticated) redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, detail.error ?? "session_required"));
  const lead = detail.status === "success" ? detail.data : undefined;
  const advisorName = advisorDisplayName(teamMembers, lead?.advisorId);
  const notFound = isNotFoundState(detail);
  const canMutate = canMutateCrmLead(session.profile);
  const tenantReadOnly = isTenantReadOnly(session.profile);
  const showForms = Boolean(lead) && canMutate;
  const noticeEntry = crm ? NOTICES[crm] : undefined;
  const proposalNoticeEntry = proposal ? PROPOSAL_NOTICES[proposal] : undefined;
  const canAssign = canAssignCrmLead(session.profile);
  const contactEntries = Object.entries(lead?.contact ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  const contactMasked = lead?.contactVisibility === "masked";
  const documents = lead?.documents ?? [];
  const suggested = proposals.status === "success" ? proposals.data.suggestedNextStatus : undefined;
  const notes = lead?.notes ?? [];
  const tasks = lead?.tasks ?? [];
  const reminders = lead?.reminders ?? [];
  const history = lead?.history ?? [];
  const disputes = lead?.disputes ?? [];
  const availability = disputeAvailability({ window: lead?.disputeWindow, hasDispute: disputes.length > 0, canMutate, tenantReadOnly });
  const reasonRequiredLabels = CRM_REASON_REQUIRED_STATUSES.map((status) => CRM_STATUS_LABELS[status]).join(", ");
  const currentTab: TabKey = TABS.some((item) => item.key === tab) ? (tab as TabKey) : "synthese";
  const tabHref = (key: TabKey) => (key === "synthese" ? `/crm/leads/${leadAssignmentId}` : `/crm/leads/${leadAssignmentId}?tab=${key}`);
  const tabBadge = (key: TabKey): string | undefined => {
    if (key === "propositions" && proposals.status === "success" && proposals.data.items.length > 0) return String(proposals.data.items.length);
    if (key === "activite" && notes.length + tasks.length + reminders.length > 0) return String(notes.length + tasks.length + reminders.length);
    return undefined;
  };

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue tableau", href: "/crm/leads" }, { label: lead?.publicReference || "Lead CRM" }]}
        title={lead?.publicReference || "Lead CRM"}
        description="Notes, documents internes et tâches ne sont jamais visibles côté Web Publique Client."
        actions={
          <Cluster>
            {lead ? <StatusBadge status={lead.status} labels={crmStatusLabels} tones={{ [lead.status]: statusTone(lead.status) }} /> : null}
            <Button href="/crm/kanban" variant="secondary" size="sm">Vue Kanban</Button>
          </Cluster>
        }
      />

      {noticeEntry ? <Notice tone={noticeEntry.tone}>{noticeEntry.message}</Notice> : null}
      {proposalNoticeEntry ? <Notice tone={proposalNoticeEntry.tone}>{proposalNoticeEntry.message}</Notice> : null}
      {detail.status === "forbidden" ? <Notice tone="warning" title="Accès refusé">Ce lead n'est pas accessible avec vos permissions CRM ou votre tenant.</Notice> : null}
      {notFound ? <Notice tone="warning" title="Lead introuvable">Aucun lead CRM ne correspond à cette référence pour votre cabinet.</Notice> : null}
      {detail.status === "error" && !notFound ? <Notice tone="warning" title="Lead indisponible">{detail.error ?? "erreur inconnue"}</Notice> : null}
      {lead && !canMutate ? (
        <Notice tone="info" title="Lecture seule">
          {tenantReadOnly
            ? TENANT_SUSPENDED_MESSAGE
            : "Votre rôle CRM ne permet pas de modifier ce lead. Statut, notes, tâches et rappels restent consultables uniquement."}
        </Notice>
      ) : null}

      {lead ? (
        <>
          <Tabs
            label="Sections de la fiche CRM"
            items={TABS.map((item) => ({ label: item.label, href: tabHref(item.key), current: item.key === currentTab, badge: tabBadge(item.key) }))}
          />

          <Split>
            <Stack>
              {currentTab === "synthese" ? (
                <>
                  <Card title="Synthèse">
                    {lead ? (
                      <DescriptionList
                        columns={2}
                        items={[
                          { term: "Statut", value: <StatusBadge status={lead.status} labels={crmStatusLabels} tones={{ [lead.status]: statusTone(lead.status) }} /> },
                          { term: "Reçu le", value: formatDate(lead.assignedAt) },
                          { term: "Pays / produit", value: `${lead.countryCode} / ${productLabel(lead.productKey)}` },
                          { term: "Urgence", value: lead.urgency ? CRM_URGENCY_LABELS[lead.urgency] ?? lead.urgency : "-" },
                          { term: "Source", value: lead.source ? CRM_SOURCE_LABELS[lead.source] ?? lead.source : "-" },
                          { term: "Conseiller", value: advisorName },
                          {
                            term: "Exclusivité",
                            value: lead.isShared
                              ? `Lead partagé avec ${(lead.recipientCount ?? 2) - 1} autre(s) courtier(s) partenaire(s), au tarif réduit. L'identité des autres courtiers n'est pas communiquée.`
                              : "Lead exclusif: vous êtes le seul courtier partenaire destinataire."
                          }
                        ]}
                      />
                    ) : (
                      <p className={styles.muted}>Aucune donnée CRM affichée pour ce lead.</p>
                    )}
                  </Card>

                  {lead ? (
                    <Card title="Coordonnées du visiteur" description="Coordonnées complètes pour le courtier affecté, dès l'affectation. Chaque consultation est auditée.">
                      {contactMasked ? (
                        <Notice tone="warning">Le visiteur a retiré son consentement : coordonnées masquées, le lead ne doit plus être recontacté.</Notice>
                      ) : null}
                      {contactEntries.length > 0 ? (
                        <DescriptionList columns={2}>
                          {contactEntries.map(([key, value]) => (
                            <div key={key}>
                              <dt>{CONTACT_LABELS[key] ?? key}</dt>
                              <dd className="bo-break">{key === "email" ? <a href={`mailto:${String(value)}`}>{String(value)}</a> : key === "phone" ? <a href={`tel:${String(value)}`}>{String(value)}</a> : renderAnswerValue(value)}</dd>
                            </div>
                          ))}
                        </DescriptionList>
                      ) : (
                        <p className={styles.muted}>Aucune coordonnée exposée pour ce lead.</p>
                      )}
                    </Card>
                  ) : null}

                  {lead ? <DisputeStatusCard disputes={disputes} /> : null}

                  {lead ? (
                    <Card
                      title="Contester ce lead"
                      description="Un lead se conteste une seule fois, dans les 30 jours suivant sa réception. La finance AssurMatch statue ; si la contestation est acceptée, le lead est crédité sur votre prochain brouillon de facture ou par un avoir partiel."
                    >
                      <Notice tone={availability.canDispute ? "info" : "warning"}>{availability.message}</Notice>
                      {availability.canDispute ? (
                        <ConfirmDialog
                          triggerLabel="Contester"
                          title="Contester ce lead"
                          description={`Le motif est obligatoire. La contestation est historisée avec acteur, date et motif, puis transmise à la finance AssurMatch. ${DISPUTE_FINAL_DECISION_NOTICE}`}
                          confirmLabel="Contester le lead"
                          cancelLabel="Annuler"
                          tone="danger"
                          formAction={disputeCrmLeadAction}
                        >
                          <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                          <Field id="crm-dispute-reason" label="Motif de la contestation" required requiredLabel="obligatoire">
                            <Select
                              id="crm-dispute-reason"
                              name="reason"
                              required
                              defaultValue=""
                              aria-label="Motif de la contestation"
                              placeholder="Choisir un motif"
                              options={CRM_OUTCOME_REASONS.map((reason) => ({ value: reason, label: CRM_REASON_LABELS[reason] }))}
                            />
                          </Field>
                          <Field id="crm-dispute-comment" label="Commentaire">
                            <Input id="crm-dispute-comment" name="comment" maxLength={500} placeholder="Facultatif" aria-label="Commentaire de la contestation" />
                          </Field>
                        </ConfirmDialog>
                      ) : null}
                    </Card>
                  ) : null}

                  {lead && Object.keys(lead.answers).length > 0 ? (
                    <Card title="Réponses consenties">
                      <DescriptionList columns={2}>
                        {Object.entries(lead.answers).map(([key, value]) => (
                          <div key={key}>
                            <dt>{answerLabel(key)}</dt>
                            <dd>{renderAnswerValue(value)}</dd>
                          </div>
                        ))}
                      </DescriptionList>
                    </Card>
                  ) : null}
                </>
              ) : null}

              {currentTab === "propositions" ? (
                <Card title="Propositions au visiteur" description="Proposition indicative envoyée au visiteur dans son espace de suivi. L'envoi fait passer le lead à « devis envoyé » s'il était moins avancé.">
                  {proposals.status === "success" && lead ? (
                    <ProposalPanel
                      channel="crm"
                      leadAssignmentId={lead.leadAssignmentId}
                      data={proposals.data}
                      canMutate={canMutate}
                      tenantReadOnly={tenantReadOnly}
                      suggestedStatusLabel={suggested ? crmStatusLabel(suggested) : undefined}
                    />
                  ) : (
                    <Notice tone="warning">Propositions temporairement indisponibles.</Notice>
                  )}
                </Card>
              ) : null}

              {/* Spec 062: messagerie et demandes de documents du visiteur. */}
              {currentTab === "conversation" && lead ? <LeadConversationSection channel="crm" leadAssignmentId={lead.leadAssignmentId} canMutate={canMutate} tenantReadOnly={tenantReadOnly} notice={conv} /> : null}

              {currentTab === "activite" ? (
                <>
                  <Card title="Notes internes">
                    {notes.length > 0 ? (
                      <ul className="bo-list">
                        {notes.map((note, index) => (
                          <li key={textOf(note, "id") || `note-${index}`}>
                            <span className={styles.entryMeta}>{formatDate(textOf(note, "createdAt"))}</span> - {textOf(note, "body")}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.muted}>Aucune note interne pour ce lead.</p>
                    )}
                    {showForms && lead ? (
                      <Form action={addCrmLeadNoteAction} className={styles.subsection}>
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

                  <Card title="Tâches commerciales">
                    {tasks.length > 0 ? (
                      <ul className="bo-list">
                        {tasks.map((task, index) => (
                          <li key={textOf(task, "id") || `task-${index}`}>
                            {textOf(task, "title")}
                            {task.dueAt ? <span className={styles.entryMeta}>{` - échéance ${formatDate(textOf(task, "dueAt"))}`}</span> : ""}
                            {task.completedAt ? <> <Badge tone="success">terminée</Badge></> : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.muted}>Aucune tâche commerciale pour ce lead.</p>
                    )}
                    {showForms && lead ? (
                      <Form action={addCrmLeadTaskAction} columns={2} className={styles.subsection}>
                        <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                        <Field id="crm-task-title" label="Intitulé" required requiredLabel="obligatoire">
                          <Input id="crm-task-title" name="title" maxLength={200} required placeholder="Rappeler le prospect" aria-label="Intitulé de la tâche" />
                        </Field>
                        <Field id="crm-task-due" label="Échéance">
                          <Input id="crm-task-due" type="datetime-local" name="dueAt" aria-label="Échéance de la tâche" />
                        </Field>
                        <FormActions>
                          <Button type="submit" variant="secondary">Ajouter une tâche</Button>
                        </FormActions>
                      </Form>
                    ) : null}
                  </Card>

                  <Card title="Rappels">
                    {reminders.length > 0 ? (
                      <ul className="bo-list">
                        {reminders.map((reminder, index) => (
                          <li key={textOf(reminder, "id") || `reminder-${index}`}>
                            <span className={styles.entryMeta}>{formatDate(textOf(reminder, "remindAt"))}</span>
                            {reminder.message ? ` - ${textOf(reminder, "message")}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.muted}>Aucun rappel programmé pour ce lead.</p>
                    )}
                    {showForms && lead ? (
                      <Form action={addCrmLeadReminderAction} columns={2} className={styles.subsection}>
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
                    readOnly={tenantReadOnly}
                  />
                </>
              ) : null}

              {currentTab === "historique" ? (
                <>
                  <Card title="Historique CRM">
                    {history.length > 0 ? (
                      <ol className="bo-list">
                        {history.map((event, index) => (
                          <li key={textOf(event, "id") || `event-${index}`}>
                            <span className={styles.entryMeta}>{formatDate(textOf(event, "occurredAt"))}</span> - {crmEventLabel(textOf(event, "eventType"))}
                            {event.previousStatus || event.nextStatus
                              ? ` (${crmStatusLabel(textOf(event, "previousStatus"))} -> ${crmStatusLabel(textOf(event, "nextStatus"))})`
                              : ""}
                            {event.reason ? ` - motif: ${crmReasonLabel(textOf(event, "reason"))}` : ""}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.muted}>Aucun événement CRM historisé pour ce lead.</p>
                    )}
                  </Card>

                  <Card title="Documents et références">
                    <p className={styles.muted}>
                      Les propositions ou références de devis sont un suivi interne partenaire, pas une émission contractuelle par AssurMatch.
                      Les documents internes sont analyses par l'antivirus et ne sont jamais visibles du visiteur.
                    </p>
                    <Cluster>
                      <Badge>Document interne ({documents.filter((document) => document.visibility === "internal").length})</Badge>
                      <Badge>Document prospect ({documents.filter((document) => document.visibility === "prospect_provided").length})</Badge>
                      <Badge>Référence devis ({lead?.proposals.length ?? 0})</Badge>
                    </Cluster>
                    {documents.length > 0 ? (
                      <ul className="bo-list">
                        {documents.map((document, index) => (
                          <li key={textOf(document, "id") || `document-${index}`}>
                            <span className={styles.entryMeta}>{formatDate(textOf(document, "createdAt"))}</span> - {textOf(document, "label")}
                            {document.visibility === "prospect_provided" ? " (fourni par le visiteur)" : " (interne)"}
                            {document.scanStatus === "clean" && document.fileName ? (
                              <> - <a href={`/crm/leads/${leadAssignmentId}/documents/${textOf(document, "id")}/file`}>{textOf(document, "fileName")}</a></>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.muted}>Aucun document pour ce lead.</p>
                    )}
                    {lead && (showForms || tenantReadOnly) ? (
                      <TenantWriteGuard readOnly={tenantReadOnly}>
                        <form action={`/crm/leads/${lead.leadAssignmentId}/documents`} method="post" encType="multipart/form-data" className={`bo-form ${styles.subsection}`} aria-label="Ajouter un document interne">
                          <Field id="crm-document-label" label="Libellé du document" required requiredLabel="obligatoire">
                            <Input id="crm-document-label" name="label" required maxLength={120} aria-label="Libellé du document interne" />
                          </Field>
                          <Field id="crm-document-file" label="Fichier" required requiredLabel="obligatoire" hint="PDF, JPEG ou PNG, 5 Mo au maximum, analyse par l'antivirus.">
                            <Input id="crm-document-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" aria-label="Fichier du document interne" />
                          </Field>
                          <FormActions>
                            <Button type="submit" variant="secondary">Téléverser le document interne</Button>
                          </FormActions>
                        </form>
                      </TenantWriteGuard>
                    ) : null}
                  </Card>
                </>
              ) : null}
            </Stack>

            <Stack>
              {showForms && lead ? (
                <Card title="Changer le statut">
                  <Form action={changeCrmLeadStatusAction}>
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
                    <Field
                      id="crm-status-reason"
                      label="Motif"
                      hint={`Un motif allowliste est obligatoire pour les statuts suivants: ${reasonRequiredLabels}.`}
                    >
                      <Select
                        id="crm-status-reason"
                        name="reason"
                        defaultValue=""
                        aria-label="Motif de sortie du pipeline"
                        aria-describedby="crm-status-reason-hint"
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
                  <p className={styles.muted}>Le changement de statut est historisé avec acteur, date et motif.</p>
                </Card>
              ) : null}

              {lead ? (
                <Card title="Conseiller assigné" description="Un agent ne voit que les leads qui lui sont assignés.">
                  <p>Conseiller actuel : {advisorName}</p>
                  {canAssign && !teamAvailable ? (
                    <Notice tone="warning">Liste de l'équipe indisponible : l'assignation est momentanément impossible.</Notice>
                  ) : canAssign && advisorOptions.length === 0 ? (
                    <Notice tone="warning">Aucun membre actif dans l'équipe : invitez un conseiller avant d'assigner ce lead.</Notice>
                  ) : canAssign ? (
                    <Form action={assignCrmAdvisorAction}>
                      <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                      <Field id="crm-advisor-id" label="Conseiller" required requiredLabel="obligatoire" hint="Membre actif de votre cabinet ; un conseiller d'un autre cabinet est refusé.">
                        <Select
                          id="crm-advisor-id"
                          name="advisorId"
                          required
                          defaultValue={advisorOptions.some((option) => option.value === lead.advisorId) ? lead.advisorId : ""}
                          placeholder="Choisir un conseiller"
                          aria-label="Conseiller"
                          options={advisorOptions}
                        />
                      </Field>
                      <FormActions>
                        <Button type="submit" variant="secondary">Assigner au conseiller</Button>
                      </FormActions>
                    </Form>
                  ) : (
                    <p className={styles.muted}>Votre rôle ne permet pas d'assigner ce lead.</p>
                  )}
                </Card>
              ) : null}

              <Card title="Contrôle d'accès">
                <DescriptionList
                  items={[
                    { term: "Accès", value: <Badge tone="success">CRM autorisé</Badge> },
                    { term: "Propriétaire", value: "Organisation." },
                    { term: "Manager", value: "Équipe ou organisation selon permission." },
                    { term: "Agent", value: "Leads assignés." },
                    { term: "Lecture seule", value: "Consultation uniquement." }
                  ]}
                />
                <p className={styles.muted}>
                  Les formulaires ne sont proposés que si votre rôle autorise la mise à jour CRM. Le backend re-vérifie chaque action et audite les refus.
                </p>
              </Card>
            </Stack>
          </Split>
        </>
      ) : null}
    </PageStack>
  );
}
