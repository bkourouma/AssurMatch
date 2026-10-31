import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { isNotFoundState, readLeadProposals, readStarterLeadDetail, readStarterLeadHistory } from "../../lib/broker-api";
import { productLabel } from "../../lib/product-vocabulary";
import { PROPOSAL_NOTICES, VISITOR_RESPONSE_LABELS } from "../../lib/proposal-vocabulary";
import { ProposalPanel } from "../../lib/ui/proposal-panel";
import { LeadConversationSection } from "../../lib/ui/conversation-panel";
import { acceptStarterLeadAction, closeStarterLeadAction, disputeStarterLeadAction, rejectStarterLeadAction } from "../../lib/lead-actions";
import { TENANT_SUSPENDED_MESSAGE, canMutateStarterLead, isTenantReadOnly } from "../../lib/broker-permissions";
import {
  STARTER_ACTION_REASONS,
  STARTER_ACCEPTABLE_STATUSES,
  STARTER_CLOSABLE_STATUSES,
  STARTER_CLOSE_OUTCOMES,
  STARTER_CLOSE_OUTCOME_LABELS,
  STARTER_FINAL_STATUSES,
  STARTER_REASON_LABELS,
  DISPUTE_FINAL_DECISION_NOTICE,
  answerLabel,
  renderAnswerValue,
  starterCloseOutcomeLabel,
  starterEventLabel,
  starterReasonLabel,
  starterStatusLabel
} from "../../lib/lead-vocabulary";
import {
  Badge,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  DescriptionList,
  Field,
  Grid,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Select,
  Split,
  Stack,
  StatusBadge,
  starterStatusLabels
} from "../../lib/ui/broker-ui";
import { DisputeStatusCard } from "../../lib/ui/dispute-status-card";
import { disputeAvailability, formatDate, statusTone } from "../../lib/ui/broker-view-models";
import styles from "../../lib/ui/broker-screens.module.css";

const NOTICES: Record<string, { tone: "info" | "warning" | "danger"; message: string }> = {
  accepted: { tone: "info", message: "Lead accepté. L'action est historisée avec acteur et date." },
  rejected: { tone: "info", message: "Lead rejeté avec motif. L'action est historisée." },
  disputed: { tone: "info", message: "Contestation enregistrée et historisée. Le traitement suit le workflow existant." },
  closed: { tone: "info", message: "Lead clôturé avec son issue. Le visiteur est informé que sa demande est clôturée; l'action est historisée." },
  outcome_required: { tone: "warning", message: "Choisissez l'issue de la clôture: gagné, perdu ou sans suite." },
  conflict: { tone: "warning", message: "Clôture refusée: le lead doit être accepté et ne pas être déjà clôturé." },
  reason_required: { tone: "warning", message: "Un motif allowliste est obligatoire pour rejeter ou contester un lead." },
  // Spec 063 (CRM-012): fenêtre de 30 jours et contestation unique.
  dispute_window_expired: { tone: "warning", message: "Contestation refusée : la fenêtre de 30 jours suivant la réception du lead est close." },
  dispute_exists: { tone: "warning", message: "Contestation refusée : ce lead a déjà fait l'objet d'une contestation." },
  forbidden: { tone: "warning", message: "Action refusée: vos permissions, votre tenant ou votre MFA ne l'autorisent pas." },
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED.
  suspended: { tone: "warning", message: TENANT_SUSPENDED_MESSAGE },
  not_found: { tone: "warning", message: "Ce lead n'existe pas ou ne vous est pas assigné." },
  invalid: { tone: "warning", message: "Saisie refusée par l'API. Vérifiez le motif sélectionné." },
  error: { tone: "danger", message: "Action indisponible pour le moment. Aucun changement n'a été enregistré." }
};

const CONTACT_LABELS: Record<string, string> = {
  fullName: "Nom",
  // Spec 059: the public form sends `displayName`; the raw key was shown to the broker.
  displayName: "Nom",
  firstName: "Prénom",
  lastName: "Nom",
  email: "Email",
  emailMasked: "Email",
  phone: "Téléphone",
  phoneMasked: "Téléphone",
  city: "Ville",
  preferredChannel: "Canal préféré",
  preferredContactChannel: "Canal préféré",
  preferredContactTime: "Créneau préféré"
};

const REASON_OPTIONS = STARTER_ACTION_REASONS.map((reason) => ({ value: reason, label: STARTER_REASON_LABELS[reason] }));
const OUTCOME_OPTIONS = STARTER_CLOSE_OUTCOMES.map((outcome) => ({ value: outcome, label: STARTER_CLOSE_OUTCOME_LABELS[outcome] }));

export default async function BrokerLeadDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ leadAssignmentId: string }>;
  searchParams: Promise<{ lead?: string; proposal?: string; conv?: string }>;
}) {
  const { leadAssignmentId } = await params;
  const { lead: notice, proposal: proposalNotice, conv } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/leads/${leadAssignmentId}`, session.status));
  if (session.status !== "authenticated") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Activité", href: "/" }, { label: "Leads", href: "/leads" }, { label: "Détail" }]}
          title="Accès refusé"
          description="Le détail du lead reste masqué tant que la session, la MFA et le tenant courtier ne sont pas valides."
          actions={<Button href="/leads" variant="secondary" size="sm">Retour aux leads</Button>}
        />
        <Notice tone="warning" title="Détail du lead assigne indisponible">
          Aucune donnée protégée n'est affichée. Vérifiez votre session et votre MFA, puis rechargez la page.
        </Notice>
      </PageStack>
    );
  }

  const [detail, history, proposals] = await Promise.all([readStarterLeadDetail(leadAssignmentId), readStarterLeadHistory(leadAssignmentId), readLeadProposals("starter", leadAssignmentId)]);
  if (detail.unauthenticated) redirect(loginRedirect(`/leads/${leadAssignmentId}`, detail.error ?? "session_required"));

  const lead = detail.status === "success" ? detail.data : undefined;
  const notFound = isNotFoundState(detail);
  const events = history.status === "success" && history.data.length > 0 ? history.data : lead?.history ?? [];
  const contactEntries = Object.entries(lead?.contact ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  const answerEntries = Object.entries(lead?.answers ?? {});
  const canMutate = canMutateStarterLead(session.profile);
  const tenantReadOnly = isTenantReadOnly(session.profile);
  const isFinal = Boolean(lead && (STARTER_FINAL_STATUSES as readonly string[]).includes(lead.status));
  const showActions = Boolean(lead) && canMutate && !isFinal;
  // Spec 059 (suite): cloture d'un lead accepte (cycle de vie minimal Starter, constitution 1.3.0).
  // « Accepter » n'a de sens que tant que le lead n'est pas accepte.
  const canAccept = showActions && Boolean(lead && (STARTER_ACCEPTABLE_STATUSES as readonly string[]).includes(lead.status));
  const canClose = showActions && Boolean(lead && (STARTER_CLOSABLE_STATUSES as readonly string[]).includes(lead.status));
  // Spec 063 FR-B01/FR-B09: la contestation n'est offerte que dans la fenêtre de 30 jours et une seule fois.
  const availability = disputeAvailability({ window: lead?.disputeWindow, hasDispute: Boolean(lead?.dispute), canMutate, tenantReadOnly });
  const noticeEntry = notice ? NOTICES[notice] : undefined;
  const proposalNoticeEntry = proposalNotice ? PROPOSAL_NOTICES[proposalNotice] : undefined;
  const contactMasked = lead?.contactVisibility === "masked";
  const reference = lead ? lead.publicReference || lead.leadAssignmentId : undefined;

  // Les actions du courtier (Accepter, Rejeter, Contester, Clôturer) vivent dans la carte « Actions Starter ».
  const headerActions = lead ? (
    <Cluster>
      <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: statusTone(lead.status) }} />
    </Cluster>
  ) : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Activité", href: "/" }, { label: "Leads", href: "/leads" }, { label: reference ?? "Détail" }]}
        title={reference ?? "Détail du lead assigné"}
        description="Toute consultation détail est auditée et marque le lead comme vu lors du premier accès autorisé."
        actions={headerActions}
      />

      {noticeEntry ? <Notice tone={noticeEntry.tone}>{noticeEntry.message}</Notice> : null}

      {detail.status === "forbidden" ? (
        <Notice tone="warning" title="Accès refusé">
          Ce lead n'est pas accessible avec votre tenant, vos permissions ou votre MFA. Aucune donnée protégée n'est affichée.
        </Notice>
      ) : null}
      {notFound ? (
        <Notice tone="warning" title="Lead introuvable">
          Aucun lead ne correspond à cette référence pour votre cabinet.
        </Notice>
      ) : null}
      {detail.status === "error" && !notFound ? (
        <Notice tone="danger" title="Lead indisponible">
          Le détail du lead est temporairement indisponible. Aucune donnée protégée n'est affichée en mode erreur.
        </Notice>
      ) : null}

      {lead ? (
        <>
        <Grid columns="two">
          <Card title="Informations utiles">
            <DescriptionList
              columns={2}
              items={[
                { term: "Référence", value: <span className="bo-ref">{reference}</span> },
                {
                  term: "Statut",
                  value: <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: statusTone(lead.status) }} />
                },
                { term: "Pays", value: lead.countryCode || "-" },
                { term: "Produit", value: lead.productKey ? productLabel(lead.productKey) : "-" },
                { term: "Reçu le", value: formatDate(lead.assignedAt) },
                { term: "Vu le", value: lead.seenAt ? formatDate(lead.seenAt) : lead.seen ? "Oui" : "Pas encore" }
              ]}
            />
          </Card>

          <Card title="Contact consenti">
            {contactMasked ? (
              <Notice tone="warning">Le visiteur a retiré son consentement : ses coordonnées sont masquées et ne doivent plus être utilisées.</Notice>
            ) : (
              <p className={styles.muted}>Coordonnées complètes visibles par votre cabinet, courtier affecté. Chaque consultation est auditée.</p>
            )}
            {contactEntries.length > 0 ? (
              <DescriptionList>
                {contactEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt>{CONTACT_LABELS[key] ?? key}</dt>
                    <dd className="bo-break">
                      {key === "email" ? <a href={`mailto:${String(value)}`}>{String(value)}</a> : key === "phone" ? <a href={`tel:${String(value)}`}>{String(value)}</a> : renderAnswerValue(value)}
                    </dd>
                  </div>
                ))}
              </DescriptionList>
            ) : (
              <p className={styles.muted}>
                Aucun champ de contact n'est exposé pour ce lead. Les coordonnées ne sont affichées que si le lead est assigné au tenant connecté et que le consentement le permet.
              </p>
            )}
          </Card>
        </Grid>
        <Split>
          <Stack>
            {answerEntries.length > 0 ? (
              <Card title="Réponses consenties">
                <DescriptionList columns={2}>
                  {answerEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt>{answerLabel(key)}</dt>
                      <dd>{renderAnswerValue(value)}</dd>
                    </div>
                  ))}
                </DescriptionList>
              </Card>
            ) : null}

            <div id="repondre-au-visiteur">
              <Card title="Répondre au visiteur" description="Proposition simple et non contractuelle : message, prime indicative ou fourchette, garanties, validité et PDF facultatif.">
                {proposalNoticeEntry ? <Notice tone={proposalNoticeEntry.tone}>{proposalNoticeEntry.message}</Notice> : null}
                {proposals.status === "success" ? (
                  <ProposalPanel channel="starter" leadAssignmentId={lead.leadAssignmentId} data={proposals.data} canMutate={canMutate} tenantReadOnly={tenantReadOnly} />
                ) : (
                  <Notice tone="warning">Propositions temporairement indisponibles.</Notice>
                )}
              </Card>
            </div>

            {/* Spec 062: messagerie et demandes de documents du visiteur (id="conversation"), sans fonction CRM. */}
            <LeadConversationSection channel="starter" leadAssignmentId={lead.leadAssignmentId} canMutate={canMutate} tenantReadOnly={tenantReadOnly} notice={conv} />
          </Stack>

          <Stack>
            <Card title="Actions Starter">
              {showActions ? (
                <>
                  {canAccept ? (
                    <form action={acceptStarterLeadAction}>
                      <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                      <Cluster>
                        <Button type="submit">Accepter</Button>
                        <span>Le courtier reste responsable de la prise de contact et du suivi commercial.</span>
                      </Cluster>
                    </form>
                  ) : null}

                  <Cluster>
                    <ConfirmDialog
                      triggerLabel="Rejeter avec motif"
                      title="Rejeter avec motif"
                      description="Le rejet exige un motif allowliste. L'action est historisée avec acteur, date et motif."
                      confirmLabel="Rejeter le lead"
                      cancelLabel="Annuler"
                      tone="danger"
                      formAction={rejectStarterLeadAction}
                    >
                      <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                      <Field id="reject-reason" label="Motif du rejet" required requiredLabel="obligatoire">
                        <Select
                          id="reject-reason"
                          name="reason" required
                          defaultValue=""
                          aria-label="Motif du rejet"
                          placeholder="Choisir un motif"
                          options={REASON_OPTIONS}
                        />
                      </Field>
                      <Field id="reject-comment" label="Commentaire interne">
                        <Input id="reject-comment" name="comment" maxLength={500} placeholder="Optionnel" aria-label="Commentaire de rejet" />
                      </Field>
                    </ConfirmDialog>

                    {availability.canDispute ? (
                      <ConfirmDialog
                        triggerLabel="Contester avec motif"
                        title="Contester avec motif"
                        description={`La contestation exige un motif allowliste. Elle est transmise à la finance AssurMatch, qui statue et vous notifie. ${DISPUTE_FINAL_DECISION_NOTICE}`}
                        confirmLabel="Contester le lead"
                        cancelLabel="Annuler"
                        tone="danger"
                        formAction={disputeStarterLeadAction}
                      >
                        <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                        <Field id="dispute-reason" label="Motif de contestation" required requiredLabel="obligatoire">
                          <Select
                            id="dispute-reason"
                            name="reason" required
                            defaultValue=""
                            aria-label="Motif de contestation"
                            placeholder="Choisir un motif"
                            options={REASON_OPTIONS}
                          />
                        </Field>
                        <Field id="dispute-comment" label="Commentaire interne">
                          <Input id="dispute-comment" name="comment" maxLength={500} placeholder="Optionnel" aria-label="Commentaire de contestation" />
                        </Field>
                      </ConfirmDialog>
                    ) : (
                      <Badge tone="disabled">Contestation indisponible</Badge>
                    )}
                  </Cluster>
                  <Notice tone={availability.canDispute ? "info" : "warning"}>{availability.message}</Notice>

                  {canClose ? (
                    <Cluster>
                      <ConfirmDialog
                        triggerLabel="Clôturer"
                        triggerVariant="primary"
                        title="Clôturer le lead"
                        description="Indiquez l'issue de votre suivi. Le visiteur est informé que sa demande est clôturée, sans le détail de l'issue. L'action est historisée et définitive."
                        confirmLabel="Clôturer le lead"
                        cancelLabel="Annuler"
                        formAction={closeStarterLeadAction}
                      >
                        <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                        <Field id="close-outcome" label="Issue" required requiredLabel="obligatoire">
                          <Select
                            id="close-outcome"
                            name="outcome" required
                            defaultValue=""
                            aria-label="Issue de la clôture"
                            placeholder="Choisir une issue"
                            options={OUTCOME_OPTIONS}
                          />
                        </Field>
                        <Field id="close-comment" label="Commentaire interne">
                          <Input id="close-comment" name="comment" maxLength={500} placeholder="Optionnel" aria-label="Commentaire de clôture" />
                        </Field>
                      </ConfirmDialog>
                      <span>Lead accepté: clôturez-le une fois le suivi terminé (gagné, perdu ou sans suite).</span>
                    </Cluster>
                  ) : null}

                  <p className={styles.muted}>
                    Ces actions suivent le workflow existant: rejet et contestation exigent un motif allowliste et toute contestation est historisée.
                  </p>
                </>
              ) : (
                <>
                  <Cluster>
                    <Badge tone="disabled">Accepter</Badge>
                    <Badge tone="disabled">Rejeter avec motif</Badge>
                    <Badge tone="disabled">Contester avec motif</Badge>
                  </Cluster>
                  <Notice tone="info" title="Lecture seule">
                    {isFinal
                      ? "Ce lead est clôturé: aucune action courtier n'est plus possible."
                      : tenantReadOnly
                        ? TENANT_SUSPENDED_MESSAGE
                        : "Votre rôle ne permet pas d'agir sur ce lead. Les actions restent visibles en lecture seule."}
                  </Notice>
                </>
              )}
              <DescriptionList
                items={[
                  {
                    term: "Plan Starter",
                    value: "Le CRM complet est disponible avec le plan Pro. Le portail Starter ne présente pas Kanban, pipeline avancé, tâches, rappels ou assignation équipe comme disponibles."
                  }
                ]}
              />
            </Card>

            {lead.dispute ? <DisputeStatusCard disputes={[lead.dispute]} /> : null}

            <Card title="Historique minimal">
              {history.status === "error" ? <Notice tone="warning">Historique temporairement indisponible.</Notice> : null}
              {events.length > 0 ? (
                <ol className="bo-list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <span className={styles.entryMeta}>{formatDate(event.occurredAt)}</span> - {starterEventLabel(event.eventType)}
                      {event.previousStatus || event.nextStatus
                        ? ` (${starterStatusLabel(event.previousStatus)} -> ${starterStatusLabel(event.nextStatus)})`
                        : ""}
                      {event.reason ? ` - motif: ${starterReasonLabel(event.reason)}` : ""}
                      {event.outcome ? ` - issue: ${starterCloseOutcomeLabel(event.outcome)}` : ""}
                      {event.comment ? ` - ${event.eventType === "visitor_responded" ? VISITOR_RESPONSE_LABELS[event.comment] ?? event.comment : event.comment}` : ""}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.muted}>Aucun événement historisé pour ce lead.</p>
              )}
            </Card>
          </Stack>
        </Split>
        </>
      ) : null}
    </PageStack>
  );
}
