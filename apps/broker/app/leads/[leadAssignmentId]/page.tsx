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
import { formatDateTime } from "../../lib/conversation-vocabulary";
import { LeadSubmitButton } from "../../lib/ui/lead-submit-button";
import { leadNextStep, leadResponseDelay, receivedAgo } from "../../lib/ui/lead-timing";
import styles from "../../lib/ui/broker-screens.module.css";
import leadStyles from "../../lib/ui/lead-screens.module.css";

const NOTICES: Record<string, { tone: "info" | "warning" | "danger"; message: string }> = {
  accepted: { tone: "info", message: "Lead accepté. L'action est historisée avec acteur et date." },
  rejected: { tone: "info", message: "Lead rejeté avec motif. L'action est historisée." },
  disputed: { tone: "info", message: "Contestation enregistrée et historisée. Le traitement suit le workflow existant." },
  closed: { tone: "info", message: "Lead clôturé avec son issue. Le visiteur est informé que sa demande est clôturée; l'action est historisée." },
  outcome_required: { tone: "warning", message: "Choisissez l'issue de la clôture: gagné, perdu ou sans suite." },
  already_accepted: { tone: "warning", message: "Ce lead est déjà accepté : aucune nouvelle acceptation n'a été enregistrée." },
  not_acceptable: { tone: "warning", message: "Ce lead ne peut plus être accepté dans son état actuel (rejeté, clôturé ou contesté). Rechargez la page." },
  conflict: { tone: "warning", message: "Clôture refusée : le lead doit être accepté et ne pas être déjà clôturé." },
  reason_required: { tone: "warning", message: "Un motif est obligatoire pour rejeter ou contester un lead." },
  // Spec 063 (CRM-012): fenêtre de 30 jours et contestation unique.
  dispute_window_expired: { tone: "warning", message: "Contestation refusée : la fenêtre de 30 jours suivant la réception du lead est close." },
  dispute_exists: { tone: "warning", message: "Contestation refusée : ce lead a déjà fait l'objet d'une contestation." },
  forbidden: { tone: "warning", message: "Action refusée : vos permissions, votre tenant ou votre MFA ne l'autorisent pas." },
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
const COMMENT_HINT = "Facultatif, 500 caractères au maximum. Conservé dans l'historique du lead.";

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
        <Notice tone="warning" title="Détail du lead assigné indisponible">
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
  // Response delay and next step: derived from the facts above, no new call and no new rule.
  const nowMs = Date.now();
  const responseDelay = lead ? leadResponseDelay({ status: lead.status, assignedAt: lead.assignedAt, events, nowMs }) : undefined;
  const nextStep = leadNextStep({ tenantReadOnly, isFinal, canMutate, canAccept, canClose, canDispute: availability.canDispute && showActions });
  const acceptDeniedReason = lead
    ? lead.status === "accepted"
      ? "Ce lead est déjà accepté."
      : `Plus possible dans l'état actuel du lead (${starterStatusLabel(lead.status)}).`
    : "";

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
          <div className={leadStyles.shortcuts}>
            <Button href="/leads" variant="secondary">Retour aux leads</Button>
          </div>
        </Notice>
      ) : null}
      {notFound ? (
        <Notice tone="warning" title="Lead introuvable">
          Aucun lead ne correspond à cette référence pour votre cabinet. Vérifiez la référence ou retrouvez le lead dans votre liste.
          <div className={leadStyles.shortcuts}>
            <Button href="/leads" variant="secondary">Retour aux leads</Button>
          </div>
        </Notice>
      ) : null}
      {detail.status === "error" && !notFound ? (
        <Notice tone="danger" title="Lead indisponible">
          Le détail du lead est temporairement indisponible. Aucune donnée protégée n'est affichée en mode erreur. Aucune action n'a été enregistrée.
          <div className={leadStyles.shortcuts}>
            <Button href={`/leads/${encodeURIComponent(leadAssignmentId)}`} variant="secondary">Réessayer</Button>
            <Button href="/leads" variant="tertiary">Retour aux leads</Button>
          </div>
        </Notice>
      ) : null}

      {lead ? (
        <>
        <Notice tone={nextStep.tone} title={nextStep.title}>
          {nextStep.text}
          {responseDelay?.state === "waiting" ? ` ${receivedAgo(lead.assignedAt, nowMs) ?? ""}.` : ""}
          {nextStep.links.length > 0 ? (
            <div className={`${leadStyles.shortcuts} ${leadStyles.touch}`}>
              {nextStep.links.map((link) => (
                <Button key={link.href} href={link.href} variant="secondary" size="sm">{link.label}</Button>
              ))}
            </div>
          ) : null}
        </Notice>
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
                { term: "Vu le", value: lead.seenAt ? formatDate(lead.seenAt) : lead.seen ? "Oui" : "Pas encore" },
                ...(responseDelay ? [{ term: "Délai de réponse", value: responseDelay.label }] : [])
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
            <div id="actions-lead" className={leadStyles.touch}>
            <Card title="Actions Starter">
              {showActions ? (
                <>
                  {canAccept ? (
                    <form action={acceptStarterLeadAction}>
                      <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                      <Stack>
                        <div>
                          <LeadSubmitButton pendingLabel="Acceptation en cours…">Accepter</LeadSubmitButton>
                        </div>
                        <p className={leadStyles.hint}>Le courtier reste responsable de la prise de contact et du suivi commercial.</p>
                      </Stack>
                    </form>
                  ) : (
                    <ul className={leadStyles.unavailable}>
                      <li>
                        <Badge tone="disabled">Accepter</Badge>
                        <span className={leadStyles.hint}>{acceptDeniedReason}</span>
                      </li>
                    </ul>
                  )}

                  <Cluster>
                    <ConfirmDialog
                      triggerLabel="Rejeter avec motif"
                      title="Rejeter avec motif"
                      description="Le rejet exige un motif. L'action est historisée avec acteur, date et motif."
                      confirmLabel="Rejeter le lead"
                      cancelLabel="Annuler"
                      tone="danger"
                      formAction={rejectStarterLeadAction}
                    >
                      <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                      <Field id="reject-reason" label="Motif du rejet" required requiredLabel="obligatoire" hint="Choisissez le motif le plus proche : il est conservé dans l'historique du lead.">
                        <Select
                          id="reject-reason"
                          name="reason" required
                          defaultValue=""
                          aria-describedby="reject-reason-hint"
                          placeholder="Choisir un motif"
                          options={REASON_OPTIONS}
                        />
                      </Field>
                      <Field id="reject-comment" label="Commentaire interne" hint={COMMENT_HINT}>
                        <Input id="reject-comment" name="comment" maxLength={500} placeholder="Optionnel" aria-describedby="reject-comment-hint" />
                      </Field>
                    </ConfirmDialog>

                    {availability.canDispute ? (
                      <ConfirmDialog
                        triggerLabel="Contester avec motif"
                        title="Contester avec motif"
                        description={`La contestation exige un motif. Elle est transmise à la finance AssurMatch, qui statue et vous notifie. ${DISPUTE_FINAL_DECISION_NOTICE}`}
                        confirmLabel="Contester le lead"
                        cancelLabel="Annuler"
                        tone="danger"
                        formAction={disputeStarterLeadAction}
                      >
                        <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                        <Field id="dispute-reason" label="Motif de contestation" required requiredLabel="obligatoire" hint="Une contestation est unique et suivie par la finance AssurMatch.">
                          <Select
                            id="dispute-reason"
                            name="reason" required
                            defaultValue=""
                            aria-describedby="dispute-reason-hint"
                            placeholder="Choisir un motif"
                            options={REASON_OPTIONS}
                          />
                        </Field>
                        <Field id="dispute-comment" label="Commentaire interne" hint={COMMENT_HINT}>
                          <Input id="dispute-comment" name="comment" maxLength={500} placeholder="Optionnel" aria-describedby="dispute-comment-hint" />
                        </Field>
                      </ConfirmDialog>
                    ) : (
                      <Badge tone="disabled">Contestation indisponible</Badge>
                    )}
                  </Cluster>
                  <Notice tone={availability.canDispute ? "info" : "warning"}>{availability.message}</Notice>

                  {canClose ? (
                    <Stack>
                      <div>
                        <ConfirmDialog
                          triggerLabel="Clôturer"
                          triggerVariant="secondary"
                          title="Clôturer le lead"
                          description="Indiquez l'issue de votre suivi. Le visiteur est informé que sa demande est clôturée, sans le détail de l'issue. L'action est historisée et définitive."
                          confirmLabel="Clôturer le lead"
                          cancelLabel="Annuler"
                          formAction={closeStarterLeadAction}
                        >
                          <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                          <Field id="close-outcome" label="Issue" required requiredLabel="obligatoire" hint="Gagné, perdu ou sans suite. Le visiteur n'est pas informé de l'issue.">
                            <Select
                              id="close-outcome"
                              name="outcome" required
                              defaultValue=""
                              aria-describedby="close-outcome-hint"
                              placeholder="Choisir une issue"
                              options={OUTCOME_OPTIONS}
                            />
                          </Field>
                          <Field id="close-comment" label="Commentaire interne" hint="500 caractères au maximum. Conservé dans l'historique du lead ; la clôture ne peut plus être annulée.">
                            <Input id="close-comment" name="comment" maxLength={500} placeholder="Optionnel" aria-describedby="close-comment-hint" />
                          </Field>
                        </ConfirmDialog>
                      </div>
                      <p className={leadStyles.hint}>Lead accepté: clôturez-le une fois le suivi terminé (gagné, perdu ou sans suite).</p>
                    </Stack>
                  ) : (
                    <ul className={leadStyles.unavailable}>
                      <li>
                        <Badge tone="disabled">Clôturer</Badge>
                        <span className={leadStyles.hint}>Disponible une fois le lead accepté.</span>
                      </li>
                    </ul>
                  )}

                  <p className={styles.muted}>
                    Le rejet et la contestation exigent un motif. Chaque action est historisée avec son acteur et sa date.
                  </p>
                </>
              ) : (
                <>
                  <Cluster>
                    <Badge tone="disabled">Accepter</Badge>
                    <Badge tone="disabled">Rejeter avec motif</Badge>
                    <Badge tone="disabled">Contester avec motif</Badge>
                    <Badge tone="disabled">Clôturer</Badge>
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
            </div>

            {lead.dispute ? <DisputeStatusCard disputes={[lead.dispute]} /> : null}

            <div id="historique-lead">
            <Card title="Historique minimal">
              {history.status === "error" ? <Notice tone="warning">Historique temporairement indisponible.</Notice> : null}
              {events.length > 0 ? (
                <ol className={leadStyles.timeline} aria-label="Événements du lead">
                  {events.map((event) => (
                    <li key={event.id} className={leadStyles.timelineItem}>
                      <span className={leadStyles.timelineDate}>{formatDateTime(event.occurredAt)}</span>
                      <span className={leadStyles.timelineBody}>
                        <span className={leadStyles.timelineTitle}>{starterEventLabel(event.eventType)}</span>
                        {event.previousStatus || event.nextStatus ? (
                          <span className={leadStyles.timelineDetail}>{`${starterStatusLabel(event.previousStatus)} -> ${starterStatusLabel(event.nextStatus)}`}</span>
                        ) : null}
                        {event.reason ? <span className={leadStyles.timelineDetail}>{`motif: ${starterReasonLabel(event.reason)}`}</span> : null}
                        {event.outcome ? <span className={leadStyles.timelineDetail}>{`issue: ${starterCloseOutcomeLabel(event.outcome)}`}</span> : null}
                        {event.comment ? (
                          <span className={leadStyles.timelineDetail}>
                            {event.eventType === "visitor_responded" ? VISITOR_RESPONSE_LABELS[event.comment] ?? event.comment : event.comment}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.muted}>Aucun événement historisé pour ce lead. Les actions à venir (acceptation, proposition, clôture) y apparaîtront avec leur date.</p>
              )}
            </Card>
            </div>
          </Stack>
        </Split>
        </>
      ) : null}
    </PageStack>
  );
}
