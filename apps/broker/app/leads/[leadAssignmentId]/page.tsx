import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { isNotFoundState, readStarterLeadDetail, readStarterLeadHistory } from "../../lib/broker-api";
import { acceptStarterLeadAction, disputeStarterLeadAction, rejectStarterLeadAction } from "../../lib/lead-actions";
import { canMutateStarterLead } from "../../lib/broker-permissions";
import {
  STARTER_ACTION_REASONS,
  STARTER_FINAL_STATUSES,
  STARTER_REASON_LABELS,
  renderAnswerValue,
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
  StatusBadge,
  starterStatusLabels
} from "../../lib/ui/broker-ui";
import { formatDate, statusTone } from "../../lib/ui/broker-view-models";

const NOTICES: Record<string, { tone: "info" | "warning" | "danger"; message: string }> = {
  accepted: { tone: "info", message: "Lead accepte. L'action est historisee avec acteur et date." },
  rejected: { tone: "info", message: "Lead rejete avec motif. L'action est historisee." },
  disputed: { tone: "info", message: "Contestation enregistree et historisee. Le traitement suit le workflow existant." },
  reason_required: { tone: "warning", message: "Un motif allowliste est obligatoire pour rejeter ou contester un lead." },
  forbidden: { tone: "warning", message: "Action refusee: vos permissions, votre tenant ou votre MFA ne l'autorisent pas." },
  not_found: { tone: "warning", message: "Ce lead n'existe pas ou ne vous est pas assigne." },
  invalid: { tone: "warning", message: "Saisie refusee par l'API. Verifiez le motif selectionne." },
  error: { tone: "danger", message: "Action indisponible pour le moment. Aucun changement n'a ete enregistre." }
};

const CONTACT_LABELS: Record<string, string> = {
  fullName: "Nom",
  firstName: "Prenom",
  lastName: "Nom",
  email: "Email",
  emailMasked: "Email",
  phone: "Telephone",
  phoneMasked: "Telephone",
  city: "Ville",
  preferredChannel: "Canal prefere",
  preferredContactTime: "Creneau prefere"
};

const REASON_OPTIONS = STARTER_ACTION_REASONS.map((reason) => ({ value: reason, label: STARTER_REASON_LABELS[reason] }));

export default async function BrokerLeadDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ leadAssignmentId: string }>;
  searchParams: Promise<{ lead?: string }>;
}) {
  const { leadAssignmentId } = await params;
  const { lead: notice } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/leads/${leadAssignmentId}`, session.status));
  if (session.status !== "authenticated") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Activite", href: "/" }, { label: "Leads", href: "/leads" }, { label: "Detail" }]}
          kicker="Lead assigne"
          title="Acces refuse"
          description="Le detail du lead reste masque tant que la session, la MFA et le tenant courtier ne sont pas valides."
          actions={<Button href="/leads" variant="secondary" size="sm">Retour aux leads</Button>}
        />
        <Notice tone="warning" title="Detail du lead assigne indisponible">
          Aucune donnee protegee n'est affichee. Verifiez votre session et votre MFA, puis rechargez la page.
        </Notice>
      </PageStack>
    );
  }

  const [detail, history] = await Promise.all([readStarterLeadDetail(leadAssignmentId), readStarterLeadHistory(leadAssignmentId)]);
  if (detail.unauthenticated) redirect(loginRedirect(`/leads/${leadAssignmentId}`, detail.error ?? "session_required"));

  const lead = detail.status === "success" ? detail.data : undefined;
  const notFound = isNotFoundState(detail);
  const events = history.status === "success" && history.data.length > 0 ? history.data : lead?.history ?? [];
  const contactEntries = Object.entries(lead?.contact ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  const answerEntries = Object.entries(lead?.answers ?? {});
  const canMutate = canMutateStarterLead(session.profile);
  const isFinal = Boolean(lead && (STARTER_FINAL_STATUSES as readonly string[]).includes(lead.status));
  const showActions = Boolean(lead) && canMutate && !isFinal;
  const noticeEntry = notice ? NOTICES[notice] : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Activite", href: "/" }, { label: "Leads", href: "/leads" }, { label: "Detail" }]}
        kicker="Lead assigne au courtier connecte"
        title="Detail du lead assigne"
        description="Informations consenties, pays, produit, statut et historique minimal. Toute consultation detail est auditee et marque le lead comme vu lors du premier acces autorise."
        actions={
          <Cluster>
            <Badge tone="info">Tenant courtier verifie</Badge>
            <Button href="/leads" variant="secondary" size="sm">Retour aux leads</Button>
          </Cluster>
        }
      />

      {noticeEntry ? <Notice tone={noticeEntry.tone}>{noticeEntry.message}</Notice> : null}

      {detail.status === "forbidden" ? (
        <Notice tone="warning" title="Acces refuse">
          Ce lead n'est pas accessible avec votre tenant, vos permissions ou votre MFA. Aucune donnee protegee n'est affichee.
        </Notice>
      ) : null}
      {notFound ? (
        <Notice tone="warning" title="Lead introuvable">
          Aucun lead ne correspond a cette reference pour votre cabinet.
        </Notice>
      ) : null}
      {detail.status === "error" && !notFound ? (
        <Notice tone="danger" title="Lead indisponible">
          Le detail du lead est temporairement indisponible. Aucune donnee protegee n'est affichee en mode erreur.
        </Notice>
      ) : null}

      {lead ? (
        <Grid columns="two">
          <Card title="Informations utiles">
            <DescriptionList
              items={[
                { term: "Reference", value: lead.publicReference || lead.leadAssignmentId },
                { term: "Pays", value: lead.countryCode || "-" },
                { term: "Produit", value: lead.productKey || "-" },
                {
                  term: "Statut",
                  value: <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: statusTone(lead.status) }} />
                },
                { term: "Recu le", value: formatDate(lead.assignedAt) },
                { term: "Vu le", value: lead.seenAt ? formatDate(lead.seenAt) : lead.seen ? "Oui" : "Pas encore" }
              ]}
            />
          </Card>

          <Card title="Contact consenti">
            {contactEntries.length > 0 ? (
              <DescriptionList>
                {contactEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt>{CONTACT_LABELS[key] ?? key}</dt>
                    <dd>{renderAnswerValue(value)}</dd>
                  </div>
                ))}
              </DescriptionList>
            ) : (
              <p>
                Aucun champ de contact n'est expose pour ce lead. Les coordonnees ne sont affichees que si le lead est assigne au tenant connecte et que le consentement le permet.
              </p>
            )}
          </Card>
        </Grid>
      ) : null}

      {lead ? (
        <Card title="Actions Starter">
          {showActions ? (
            <>
              <form action={acceptStarterLeadAction}>
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <Cluster>
                  <Button type="submit">Accepter</Button>
                  <span>Le courtier reste responsable de la prise de contact et du suivi commercial.</span>
                </Cluster>
              </form>

              <Cluster>
                <ConfirmDialog
                  triggerLabel="Rejeter avec motif"
                  title="Rejeter avec motif"
                  description="Le rejet exige un motif allowliste. L'action est historisee avec acteur, date et motif."
                  confirmLabel="Rejeter le lead"
                  cancelLabel="Annuler"
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

                <ConfirmDialog
                  triggerLabel="Contester avec motif"
                  title="Contester avec motif"
                  description="La contestation exige un motif allowliste et suit le workflow existant."
                  confirmLabel="Contester le lead"
                  cancelLabel="Annuler"
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
              </Cluster>

              <p>
                Ces actions suivent le workflow existant: rejet et contestation exigent un motif allowliste et toute contestation est historisee.
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
                  ? "Ce lead est cloture: aucune action courtier n'est plus possible."
                  : "Votre role ne permet pas d'agir sur ce lead. Les actions restent visibles en lecture seule."}
              </Notice>
            </>
          )}
        </Card>
      ) : null}

      {lead && answerEntries.length > 0 ? (
        <Card title="Reponses consenties">
          <DescriptionList>
            {answerEntries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{renderAnswerValue(value)}</dd>
              </div>
            ))}
          </DescriptionList>
        </Card>
      ) : null}

      <Card title="Historique minimal">
        {history.status === "error" && lead ? <Notice tone="warning">Historique temporairement indisponible.</Notice> : null}
        {events.length > 0 ? (
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                {formatDate(event.occurredAt)} - {starterEventLabel(event.eventType)}
                {event.previousStatus || event.nextStatus
                  ? ` (${starterStatusLabel(event.previousStatus)} -> ${starterStatusLabel(event.nextStatus)})`
                  : ""}
                {event.reason ? ` - motif: ${starterReasonLabel(event.reason)}` : ""}
                {event.comment ? ` - ${event.comment}` : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p>Aucun evenement historise pour ce lead.</p>
        )}
      </Card>

      <Notice tone="info" title="Plan Starter">
        Le CRM complet est disponible avec le plan Pro. Le portail Starter ne presente pas Kanban, pipeline avance, taches, rappels ou assignation equipe comme disponibles.
      </Notice>
    </PageStack>
  );
}
