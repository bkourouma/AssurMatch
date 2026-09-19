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
import { Badge, Card, PageHeader, StateMessage } from "../../lib/ui/broker-ui";
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
      <div className="page-stack">
        <a href="/leads">Retour aux leads</a>
        <PageHeader
          kicker="Lead assigne"
          title="Acces refuse"
          description="Le detail du lead reste masque tant que la session, la MFA et le tenant courtier ne sont pas valides."
        />
        <StateMessage tone="warning" title="Detail du lead assigne indisponible">
          Aucune donnee protegee n'est affichee. Verifiez votre session et votre MFA, puis rechargez la page.
        </StateMessage>
      </div>
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
    <div className="page-stack">
      <a href="/leads">Retour aux leads</a>
      <PageHeader
        kicker="Lead assigne au courtier connecte"
        title="Detail du lead assigne"
        description="Informations consenties, pays, produit, statut et historique minimal. Toute consultation detail est auditee et marque le lead comme vu lors du premier acces autorise."
        actions={<Badge tone="info">Tenant courtier verifie</Badge>}
      />

      {noticeEntry ? <StateMessage tone={noticeEntry.tone}>{noticeEntry.message}</StateMessage> : null}

      {detail.status === "forbidden" ? (
        <StateMessage tone="warning" title="Acces refuse">
          Ce lead n'est pas accessible avec votre tenant, vos permissions ou votre MFA. Aucune donnee protegee n'est affichee.
        </StateMessage>
      ) : null}
      {notFound ? (
        <StateMessage tone="warning" title="Lead introuvable">
          Aucun lead ne correspond a cette reference pour votre cabinet.
        </StateMessage>
      ) : null}
      {detail.status === "error" && !notFound ? (
        <StateMessage tone="danger" title="Lead indisponible">
          Le detail du lead est temporairement indisponible. Aucune donnee protegee n'est affichee en mode erreur.
        </StateMessage>
      ) : null}

      {lead ? (
        <section className="broker-grid broker-grid--two">
          <Card plain>
            <h2 className="section-title">Informations utiles</h2>
            <dl className="definition-list">
              <dt>Reference</dt><dd>{lead.publicReference || lead.leadAssignmentId}</dd>
              <dt>Pays</dt><dd>{lead.countryCode || "-"}</dd>
              <dt>Produit</dt><dd>{lead.productKey || "-"}</dd>
              <dt>Statut</dt><dd><Badge tone={statusTone(lead.status)}>{starterStatusLabel(lead.status)}</Badge></dd>
              <dt>Recu le</dt><dd>{formatDate(lead.assignedAt)}</dd>
              <dt>Vu le</dt><dd>{lead.seenAt ? formatDate(lead.seenAt) : lead.seen ? "Oui" : "Pas encore"}</dd>
            </dl>
          </Card>

          <Card plain>
            <h2 className="section-title">Contact consenti</h2>
            {contactEntries.length > 0 ? (
              <dl className="definition-list">
                {contactEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt>{CONTACT_LABELS[key] ?? key}</dt>
                    <dd>{renderAnswerValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="page-description">
                Aucun champ de contact n'est expose pour ce lead. Les coordonnees ne sont affichees que si le lead est assigne au tenant connecte et que le consentement le permet.
              </p>
            )}
          </Card>
        </section>
      ) : null}

      {lead ? (
        <Card plain>
          <h2 className="section-title">Actions Starter</h2>
          {showActions ? (
            <div className="page-stack">
              <form action={acceptStarterLeadAction} className="inline-cluster">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <button type="submit" className="button">Accepter</button>
                <span className="page-description">Le courtier reste responsable de la prise de contact et du suivi commercial.</span>
              </form>

              <form action={rejectStarterLeadAction} className="form-grid">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <label className="field">
                  Motif du rejet
                  <select name="reason" required defaultValue="" aria-label="Motif du rejet">
                    <option value="" disabled>Choisir un motif</option>
                    {STARTER_ACTION_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{STARTER_REASON_LABELS[reason]}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Commentaire interne
                  <input name="comment" maxLength={500} placeholder="Optionnel" aria-label="Commentaire de rejet" />
                </label>
                <button type="submit" className="button button--secondary">Rejeter avec motif</button>
              </form>

              <form action={disputeStarterLeadAction} className="form-grid">
                <input type="hidden" name="leadAssignmentId" value={lead.leadAssignmentId} />
                <label className="field">
                  Motif de contestation
                  <select name="reason" required defaultValue="" aria-label="Motif de contestation">
                    <option value="" disabled>Choisir un motif</option>
                    {STARTER_ACTION_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{STARTER_REASON_LABELS[reason]}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Commentaire interne
                  <input name="comment" maxLength={500} placeholder="Optionnel" aria-label="Commentaire de contestation" />
                </label>
                <button type="submit" className="button button--secondary">Contester avec motif</button>
              </form>

              <p className="page-description">
                Ces actions suivent le workflow existant: rejet et contestation exigent un motif allowliste et toute contestation est historisee.
              </p>
            </div>
          ) : (
            <>
              <div className="inline-cluster">
                <Badge tone="disabled">Accepter</Badge>
                <Badge tone="disabled">Rejeter avec motif</Badge>
                <Badge tone="disabled">Contester avec motif</Badge>
              </div>
              <StateMessage tone="info" title="Lecture seule">
                {isFinal
                  ? "Ce lead est cloture: aucune action courtier n'est plus possible."
                  : "Votre role ne permet pas d'agir sur ce lead. Les actions restent visibles en lecture seule."}
              </StateMessage>
            </>
          )}
        </Card>
      ) : null}

      {lead && answerEntries.length > 0 ? (
        <Card plain>
          <h2 className="section-title">Reponses consenties</h2>
          <dl className="definition-list">
            {answerEntries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{renderAnswerValue(value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card plain>
        <h2 className="section-title">Historique minimal</h2>
        {history.status === "error" && lead ? (
          <StateMessage tone="warning">Historique temporairement indisponible.</StateMessage>
        ) : null}
        {events.length > 0 ? (
          <ol className="simple-list">
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
          <p className="page-description">Aucun evenement historise pour ce lead.</p>
        )}
      </Card>

      <StateMessage title="Plan Starter">
        Le CRM complet est disponible avec le plan Pro. Le portail Starter ne presente pas Kanban, pipeline avance, taches, rappels ou assignation equipe comme disponibles.
      </StateMessage>
    </div>
  );
}
