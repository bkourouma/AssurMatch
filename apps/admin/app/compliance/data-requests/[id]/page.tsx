import { readDataRequest } from "../../../lib/admin-api";
import { readBackOfficeSession } from "../../../lib/backoffice-auth";
import { completeDataRequest, rejectDataRequest, startDataRequestErasure, takeDataRequest } from "../../../lib/data-request-actions";
import {
  DATA_REQUEST_HISTORY_LABELS,
  DATA_REQUEST_NOTICES,
  DATA_REQUEST_STATUS_LABELS,
  DATA_REQUEST_TYPE_LABELS,
  COMPLETE_WITHOUT_ERASURE_WARNING,
  START_ERASURE_CONFIRMATION,
  formatDataRequestDate
} from "../../../lib/data-request-labels";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Cluster,
  DataTable,
  DescriptionList,
  Field,
  Form,
  FormActions,
  Grid,
  PageHeader,
  PageStack,
  StateMessage,
  Textarea,
  fieldControlProps
} from "../../../lib/ui/admin-ui";
import { readFailureDetail } from "../../../lib/auth-error-messages";
import { PendingActionButton } from "../../../lib/ui/pending-action-button";

/**
 * Spec 062 (D-10): one data-subject request. The visitor's own text (personal data) is rendered
 * only when the API sends it, which it never does for the support role. Closing a request sends the
 * visitor a pointer e-mail; the erasure action creates the spec 046 PREVIEW only.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIDING_ROLES = new Set(["compliance_admin", "super_admin"]);
const OPEN_STATUSES = new Set(["received", "in_review"]);

interface HistoryRow {
  action: string;
  at: string;
}

export default async function DataRequestDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const notice = query.notice ? DATA_REQUEST_NOTICES[query.notice] : undefined;
  const validId = UUID.test(id);
  const [result, session] = await Promise.all([
    validId ? readDataRequest(id) : Promise.resolve(undefined),
    readBackOfficeSession()
  ]);
  const request = result?.status === "success" ? result.data : null;
  const canDecide = session.status === "authenticated" && session.profile.roles.some((role) => DECIDING_ROLES.has(role));
  const isOpen = request ? OPEN_STATUSES.has(request.status) : false;
  const statusLabel = request ? DATA_REQUEST_STATUS_LABELS[request.status] : undefined;
  const history: HistoryRow[] = request?.history ?? [];
  const completesWithoutErasure = request?.type === "erasure" && !request.erasureBatchId;
  const nextStep =
    request?.status === "received"
      ? "Étape suivante : prenez en charge la demande, puis clôturez-la comme traitée ou rejetez-la avec une note interne."
      : request?.status === "in_review"
        ? "Étape suivante : clôturez la demande comme traitée, ou rejetez-la avec une note interne."
        : null;
  const showErasure = request?.type === "erasure" && request.erasureAllowed !== false && isOpen && canDecide;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[
          { label: "Pilotage" },
          { label: "Conformité", href: "/compliance" },
          { label: "Demandes de données des visiteurs", href: "/compliance/data-requests" },
          { label: request?.reference ?? "Détail" }
        ]}
        kicker="Conformité"
        title={request ? `Demande ${request.reference}` : "Demande de données"}
        description="Demande d'accès, de rectification ou d'effacement d'un visiteur. L'échéance affichée est indicative."
        actions={<Button href="/compliance/data-requests" variant="secondary">Retour à la file</Button>}
      />

      {!validId || result?.error === "api_404" ? <StateMessage tone="warning">Demande introuvable.</StateMessage> : null}
      {result?.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result?.forbidden ? (
        <StateMessage tone="danger">Accès refusé : MFA vérifiée et rôle de conformité ou de support requis (refus audité).</StateMessage>
      ) : null}
      {result?.status === "error" && result.error !== "api_404" ? <StateMessage tone="danger">Demande indisponible. {readFailureDetail(result.error)}</StateMessage> : null}
      {notice ? <StateMessage tone={notice.tone}>{notice.text}</StateMessage> : null}

      {request ? (
        <>
          <Cluster>
            <Badge tone={statusLabel?.tone ?? "neutral"}>{statusLabel?.label ?? request.status}</Badge>
            <span>{DATA_REQUEST_TYPE_LABELS[request.type] ?? request.type}</span>
            <span className="bo-description">Échéance indicative : {formatDataRequestDate(request.dueAt)}</span>
            {request.overdue && isOpen ? <Badge tone="danger">En retard</Badge> : null}
          </Cluster>
          {canDecide && isOpen && nextStep ? <StateMessage tone="info">{nextStep}</StateMessage> : null}

          <Card title="Identification">
            <DescriptionList
              columns={2}
              items={[
                { term: "Référence", value: <code>{request.reference}</code> },
                { term: "Type", value: DATA_REQUEST_TYPE_LABELS[request.type] ?? request.type },
                { term: "Statut", value: <Badge tone={statusLabel?.tone ?? "neutral"}>{statusLabel?.label ?? request.status}</Badge> },
                { term: "Reçue le", value: formatDataRequestDate(request.createdAt) },
                {
                  term: "Échéance indicative",
                  value: (
                    <>
                      {formatDataRequestDate(request.dueAt)} {request.overdue && isOpen ? <Badge tone="danger">En retard</Badge> : null}
                    </>
                  )
                },
                { term: "Accusé de réception", value: formatDataRequestDate(request.acknowledgedAt) },
                { term: "Prise en charge le", value: formatDataRequestDate(request.reviewedAt) },
                { term: "Clôturée le", value: formatDataRequestDate(request.decidedAt) },
                ...(request.quoteReference ? [{ term: "Demande de devis liée", value: <code>{request.quoteReference}</code> }] : []),
                ...(request.locale ? [{ term: "Langue du visiteur", value: request.locale === "en" ? "Anglais" : "Français" }] : [])
              ]}
            />
          </Card>

          <Grid columns="two">
            <Card title="Texte du visiteur" description="Donnée personnelle écrite par le visiteur : usage strictement lié au traitement de cette demande.">
              {request.detail ? (
                <p className="bo-break">{request.detail}</p>
              ) : (
                <p data-data-request-marker="detail-masked">Texte du visiteur masqué pour votre rôle (support), ou non renseigné par le visiteur.</p>
              )}
            </Card>
            <Card title="Décision" description="La note est interne : elle n'est jamais envoyée au visiteur.">
              {request.decisionNote ? <p className="bo-break">{request.decisionNote}</p> : <p>Aucune note de décision à afficher.</p>}
            </Card>
          </Grid>

          {request.erasureBatchId ? (
            <Card title="Lot d'effacement lié" description="Aperçu créé depuis cette demande (spec 046). L'approbation et l'exécution se font uniquement dans « Conservation des données ».">
              <DescriptionList items={[{ term: "Lot", value: <code>{request.erasureBatchId}</code> }]} />
              <Button href="/compliance/retention" variant="secondary">Ouvrir les lots d&apos;anonymisation</Button>
            </Card>
          ) : null}

          {!canDecide ? (
            <StateMessage tone="info">Lecture seule : la prise en charge et la clôture sont réservées aux rôles conformité et super admin.</StateMessage>
          ) : null}

          {canDecide && isOpen ? (
            <Card title="Traiter la demande" description={`Demande ${request.reference} : chaque action est auditée. La clôture envoie au visiteur un e-mail qui renvoie vers son espace, sans le texte de la note.`}>
              {request.status === "received" ? (
                <Form action={takeDataRequest}>
                  <input type="hidden" name="id" value={request.id} />
                  <FormActions align="start">
                    <PendingActionButton variant="secondary" pendingLabel="Prise en charge...">Prendre en charge</PendingActionButton>
                  </FormActions>
                </Form>
              ) : null}

              <Form action={completeDataRequest}>
                <input type="hidden" name="id" value={request.id} />
                <Field id="dr-complete-note" label="Note interne (facultative)" hint="1 000 caractères au plus.">
                  <Textarea {...fieldControlProps("dr-complete-note", { hint: "1 000 caractères au plus." })} name="note" rows={3} maxLength={1000} />
                </Field>
                {completesWithoutErasure ? (
                  <div data-data-request-marker="complete-without-erasure">
                    <StateMessage tone="warning">{COMPLETE_WITHOUT_ERASURE_WARNING}</StateMessage>
                    <input type="hidden" name="requireNoErasureAck" value="yes" />
                    <Checkbox id="dr-complete-ack" name="acknowledgeNoErasure" value="yes" required label="Je confirme clôturer cette demande d'effacement sans effacement préparé ni exécuté." />
                  </div>
                ) : null}
                <FormActions align="start">
                  <PendingActionButton pendingLabel="Clôture...">Clôturer comme traitée</PendingActionButton>
                </FormActions>
                <p className="bo-description">Clôturer la demande {request.reference} envoie un e-mail de clôture au visiteur.</p>
              </Form>

              <Form action={rejectDataRequest}>
                <input type="hidden" name="id" value={request.id} />
                <Field id="dr-reject-note" label="Note interne (obligatoire pour rejeter)" required hint="Motif du rejet, conservé dans le dossier. 1 000 caractères au plus.">
                  <Textarea
                    {...fieldControlProps("dr-reject-note", { required: true, hint: "Motif du rejet, conservé dans le dossier. 1 000 caractères au plus." })}
                    name="note"
                    rows={3}
                    maxLength={1000}
                  />
                </Field>
                <FormActions align="start">
                  <PendingActionButton variant="danger" pendingLabel="Rejet...">Rejeter la demande</PendingActionButton>
                </FormActions>
                <p className="bo-description">Rejeter la demande {request.reference} la clôture aussi : le visiteur reçoit un e-mail de clôture, sans le texte de la note.</p>
              </Form>
            </Card>
          ) : null}

          {showErasure ? (
            <Card title="Effacement" description="Demande de type effacement : préparer l'aperçu d'effacement de la spec 046 pour la demande de devis concernée.">
              <div data-data-request-marker="erasure-confirmation">
                <StateMessage tone="warning">{START_ERASURE_CONFIRMATION}</StateMessage>
              </div>
              <Form action={startDataRequestErasure}>
                <input type="hidden" name="id" value={request.id} />
                <Checkbox id="dr-erasure-ack" name="acknowledge" value="yes" required label="J'ai compris : cette action ne crée qu'un aperçu, rien n'est effacé." />
                <FormActions align="start">
                  <PendingActionButton variant="secondary" pendingLabel="Création de l'aperçu...">Créer l&apos;aperçu d&apos;effacement</PendingActionButton>
                </FormActions>
              </Form>
            </Card>
          ) : null}
          <Card title="Historique">
            <DataTable
              columns={[
                { key: "action", header: "Événement", render: (entry: HistoryRow) => DATA_REQUEST_HISTORY_LABELS[entry.action] ?? entry.action },
                { key: "at", header: "Date", render: (entry: HistoryRow) => formatDataRequestDate(entry.at) }
              ]}
              items={history}
              getKey={(entry: HistoryRow) => `${entry.action}-${entry.at}`}
              emptyLabel="Aucun événement enregistré."
              aria-label="Historique de la demande"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
