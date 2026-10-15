import { readLeadConversation, readLeadDocumentRequests } from "../broker-api";
import type { BrokerConversationData, BrokerConversationMessageData, BrokerDocumentRequestData, BrokerDocumentRequestListData } from "../broker-api";
import { cancelDocumentRequestAction } from "../conversation-actions";
import { markConversationRead } from "../conversation-relay";
import {
  CONVERSATION_NOTICES,
  CONVERSATION_READ_ONLY_LABELS,
  DOCUMENT_REQUEST_LABEL_MAX,
  DOCUMENT_REQUEST_MAX_OPEN,
  DOCUMENT_REQUEST_NOTE_MAX,
  DOCUMENT_REQUEST_STATUS_LABELS,
  DOCUMENT_REQUEST_STATUS_TONES,
  LEAD_MESSAGE_ATTACHMENTS_MAX,
  LEAD_MESSAGE_ATTACHMENT_MIME_TYPES,
  LEAD_MESSAGE_BODY_MAX,
  attachmentHref,
  formatDateTime,
  formatFileSize,
  requestDocumentHref
} from "../conversation-vocabulary";
import type { ConversationChannel } from "../conversation-vocabulary";
import { Badge, Card, ConfirmDialog, DescriptionList, Field, Input, Notice, Stack, Textarea, TenantWriteGuard } from "./broker-ui";
import { ConversationForm } from "./conversation-form";
import { formatDate } from "./broker-view-models";

export interface ConversationPanelProps {
  channel: ConversationChannel;
  leadAssignmentId: string;
  conversation: BrokerConversationData;
  /** False for a read-only role or a suspended partner (the API refuses the write anyway). */
  canMutate: boolean;
  tenantReadOnly: boolean;
}

function readOnlyBanner(conversation: BrokerConversationData, canMutate: boolean, tenantReadOnly: boolean): string | undefined {
  if (tenantReadOnly) return CONVERSATION_READ_ONLY_LABELS.partner_suspended;
  if (conversation.state === "read_only" || !conversation.canSend) {
    return (conversation.readOnlyReason ? CONVERSATION_READ_ONLY_LABELS[conversation.readOnlyReason] : undefined) ?? "La conversation est en lecture seule.";
  }
  if (!canMutate) return "Lecture seule : votre rôle ne permet pas d'envoyer de message au visiteur.";
  return undefined;
}

function MessageItem({ message, channel, leadAssignmentId }: { message: BrokerConversationMessageData; channel: ConversationChannel; leadAssignmentId: string }) {
  const mine = message.mine === true || message.senderType === "broker";
  const attachments = message.attachments ?? [];
  return (
    <Card
      as="article"
      muted={!mine}
      title={`${mine ? "Vous" : "Visiteur"} · ${formatDateTime(message.createdAt)}`}
      actions={mine ? <Badge tone={message.readAt ? "success" : "neutral"}>{message.readAt ? `Lu le ${formatDateTime(message.readAt)}` : "Non lu"}</Badge> : null}
    >
      <Stack>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-message-sender={mine ? "broker" : "visitor"}>{message.body}</p>
        {attachments.length > 0 ? (
          <ul aria-label="Pièces jointes">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a href={attachmentHref(channel, leadAssignmentId, message.id, attachment.id)} rel="noreferrer">{attachment.fileName}</a> ({formatFileSize(attachment.sizeBytes)})
              </li>
            ))}
          </ul>
        ) : null}
      </Stack>
    </Card>
  );
}

/**
 * Spec 062: conversation courtier <-> visiteur de la fiche lead (Starter et CRM). Rendu serveur
 * (mention fixe, fil chronologique, accusés « Lu », pièces jointes par relais) ; seul le composeur est un
 * îlot client (`ConversationForm`) pour ne jamais perdre le brouillon quand l'envoi est refusé.
 * L'envoi passe par un route handler serveur : le jeton de session ne quitte jamais le serveur.
 */
export function ConversationPanel({ channel, leadAssignmentId, conversation, canMutate, tenantReadOnly }: ConversationPanelProps) {
  const action = channel === "crm" ? `/crm/leads/${leadAssignmentId}/conversation/messages` : `/leads/${leadAssignmentId}/conversation/messages`;
  const messages = conversation.messages ?? [];
  const banner = readOnlyBanner(conversation, canMutate, tenantReadOnly);
  const fieldId = `${channel}-conversation`;
  return (
    <Stack>
      {conversation.notice ? <Notice tone="info" title="Échange non contractuel">{conversation.notice}</Notice> : null}
      {banner ? <Notice tone="warning" title="Lecture seule">{banner}</Notice> : null}
      {conversation.unreadCount > 0 ? <p><Badge tone="info">{conversation.unreadCount} nouveau(x) message(s) du visiteur</Badge></p> : null}
      {conversation.nextCursor ? <Notice tone="info">Seuls les messages les plus récents sont affichés.</Notice> : null}
      {messages.length > 0 ? (
        <ol aria-label="Fil de la conversation" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--bo-space-3, 0.75rem)" }}>
          {messages.map((message) => (
            <li key={message.id}>
              <MessageItem message={message} channel={channel} leadAssignmentId={leadAssignmentId} />
            </li>
          ))}
        </ol>
      ) : (
        <p>Aucun message échangé avec le visiteur pour ce lead.</p>
      )}
      {tenantReadOnly || (canMutate && conversation.canSend) ? (
        <TenantWriteGuard readOnly={tenantReadOnly}>
          <ConversationForm action={action} ariaLabel="Nouveau message au visiteur" submitLabel="Envoyer le message" pendingLabel="Envoi en cours…" idempotent>
            <Field id={`${fieldId}-body`} label="Message au visiteur" required requiredLabel="obligatoire" hint={`${LEAD_MESSAGE_BODY_MAX} caractères au maximum. Aucune promesse de couverture ni de prix ferme.`}>
              <Textarea id={`${fieldId}-body`} name="body" required maxLength={LEAD_MESSAGE_BODY_MAX} rows={5} aria-label="Texte du message" />
            </Field>
            <Field id={`${fieldId}-files`} label="Pièces jointes facultatives" hint={`${LEAD_MESSAGE_ATTACHMENTS_MAX} fichiers au maximum, PDF, JPEG ou PNG, 5 Mo chacun, analysés par l'antivirus.`}>
              <Input id={`${fieldId}-files`} name="files" type="file" multiple accept={LEAD_MESSAGE_ATTACHMENT_MIME_TYPES.join(",")} aria-label="Pièces jointes du message" />
            </Field>
          </ConversationForm>
        </TenantWriteGuard>
      ) : null}
    </Stack>
  );
}

function DocumentRequestItem({ request, channel, leadAssignmentId, canCancel }: { request: BrokerDocumentRequestData; channel: ConversationChannel; leadAssignmentId: string; canCancel: boolean }) {
  const documents = request.documents ?? [];
  return (
    <Card as="article" muted title={request.label} actions={<Badge tone={DOCUMENT_REQUEST_STATUS_TONES[request.status] ?? "neutral"}>{DOCUMENT_REQUEST_STATUS_LABELS[request.status] ?? request.status}</Badge>}>
      <Stack>
        <DescriptionList
          items={[
            { term: "Demandée le", value: formatDate(request.createdAt) },
            ...(request.note ? [{ term: "Précision", value: <span style={{ whiteSpace: "pre-wrap" }}>{request.note}</span> }] : []),
            ...(request.dueAt ? [{ term: "À fournir avant le", value: formatDate(request.dueAt) }] : []),
            ...(request.fulfilledAt ? [{ term: "Reçue le", value: formatDate(request.fulfilledAt) }] : [])
          ]}
        />
        {documents.length > 0 ? (
          <ul aria-label="Fichiers reçus">
            {documents.map((document) => (
              <li key={document.id}>
                <a href={requestDocumentHref(channel, leadAssignmentId, request.id, document.id)} rel="noreferrer">{document.fileName}</a> ({formatFileSize(document.sizeBytes)}, reçu le {formatDateTime(document.uploadedAt)})
              </li>
            ))}
          </ul>
        ) : request.status === "open" ? (
          <p>Aucun fichier reçu pour l'instant.</p>
        ) : null}
        {canCancel && request.status === "open" ? (
          <ConfirmDialog
            triggerLabel="Annuler cette demande"
            title="Annuler la demande de document"
            description="Le visiteur ne pourra plus téléverser de fichier pour cette demande. Les fichiers déjà reçus restent consultables."
            confirmLabel="Annuler la demande"
            cancelLabel="Conserver"
            formAction={cancelDocumentRequestAction}
          >
            <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="channel" value={channel} />
          </ConfirmDialog>
        ) : null}
      </Stack>
    </Card>
  );
}

export interface DocumentRequestsPanelProps {
  channel: ConversationChannel;
  leadAssignmentId: string;
  data: BrokerDocumentRequestListData;
  canMutate: boolean;
  tenantReadOnly: boolean;
}

/**
 * Spec 062: demandes de documents au visiteur (intitulé, précision, échéance), fichiers reçus et
 * annulation. L'intitulé et la précision passent par la garde de formulations côté API ; le refus
 * cite l'expression fautive sans vider le formulaire.
 */
export function DocumentRequestsPanel({ channel, leadAssignmentId, data, canMutate, tenantReadOnly }: DocumentRequestsPanelProps) {
  const action = channel === "crm" ? `/crm/leads/${leadAssignmentId}/document-requests` : `/leads/${leadAssignmentId}/document-requests`;
  const items = data.items ?? [];
  const blockers = data.blockers ?? [];
  const fieldId = `${channel}-document-request`;
  const minDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return (
    <Stack>
      {blockers.map((blocker) => (
        <Notice key={blocker} tone="warning">{CONVERSATION_READ_ONLY_LABELS[blocker] ?? blocker}</Notice>
      ))}
      <p>Demandes ouvertes : {data.openCount} / {data.maxOpen || DOCUMENT_REQUEST_MAX_OPEN}</p>
      {items.length > 0 ? (
        items.map((request) => (
          <DocumentRequestItem key={request.id} request={request} channel={channel} leadAssignmentId={leadAssignmentId} canCancel={canMutate} />
        ))
      ) : (
        <p>Aucune demande de document pour ce lead.</p>
      )}
      {tenantReadOnly || (canMutate && data.canCreate) ? (
        <TenantWriteGuard readOnly={tenantReadOnly}>
          <ConversationForm action={action} ariaLabel="Nouvelle demande de document" submitLabel="Demander le document au visiteur" pendingLabel="Envoi en cours…">
            <Field id={`${fieldId}-label`} label="Document demandé" required requiredLabel="obligatoire" hint={`${DOCUMENT_REQUEST_LABEL_MAX} caractères au maximum. Exemple : carte grise du véhicule.`}>
              <Input id={`${fieldId}-label`} name="label" required maxLength={DOCUMENT_REQUEST_LABEL_MAX} aria-label="Intitulé du document demandé" />
            </Field>
            <Field id={`${fieldId}-note`} label="Précision pour le visiteur" hint={`${DOCUMENT_REQUEST_NOTE_MAX} caractères au maximum. Ne demandez que le nécessaire.`}>
              <Textarea id={`${fieldId}-note`} name="note" maxLength={DOCUMENT_REQUEST_NOTE_MAX} rows={3} aria-label="Précision sur le document demandé" />
            </Field>
            <Field id={`${fieldId}-due`} label="À fournir avant le" hint="Facultatif.">
              <Input id={`${fieldId}-due`} name="dueAt" type="date" min={minDate} aria-label="Date limite de fourniture" />
            </Field>
          </ConversationForm>
        </TenantWriteGuard>
      ) : null}
    </Stack>
  );
}

export interface LeadConversationSectionProps {
  channel: ConversationChannel;
  leadAssignmentId: string;
  canMutate: boolean;
  tenantReadOnly: boolean;
  /** `conv=` outcome of a no-JavaScript post or of a server action (cancel). */
  notice?: string | undefined;
}

/**
 * Spec 062: the whole « Échanger avec le visiteur » block of a lead page, mounted with ONE line by the
 * Starter page (`id="conversation"`) and by the CRM `conversation` tab. It reads the conversation and
 * the document requests of the CURRENT broker, records the read receipt (best effort) and renders
 * both panels. Starter never receives a CRM function from here.
 */
export async function LeadConversationSection({ channel, leadAssignmentId, canMutate, tenantReadOnly, notice }: LeadConversationSectionProps) {
  const [conversation, requests] = await Promise.all([readLeadConversation(channel, leadAssignmentId), readLeadDocumentRequests(channel, leadAssignmentId)]);
  // Read receipt: only when the thread is really shown and the broker may write (best effort).
  if (conversation.status === "success" && conversation.data.unreadCount > 0 && canMutate) await markConversationRead(channel, leadAssignmentId);
  const noticeEntry = notice ? CONVERSATION_NOTICES[notice] : undefined;
  return (
    <div id="conversation">
      <Stack>
        <Card title="Échanger avec le visiteur" description="Messagerie opérationnelle avec le visiteur de ce lead : texte et pièces jointes, sans engagement contractuel.">
          {noticeEntry ? (
            <Notice tone={noticeEntry.tone}>
              {noticeEntry.message}
            </Notice>
          ) : null}
          {conversation.status === "success" ? (
            <ConversationPanel channel={channel} leadAssignmentId={leadAssignmentId} conversation={conversation.data} canMutate={canMutate} tenantReadOnly={tenantReadOnly} />
          ) : (
            <Notice tone="warning">Conversation temporairement indisponible.</Notice>
          )}
        </Card>
        <Card title="Documents demandés au visiteur" description="Demandez un document au visiteur ; il le téléverse depuis son espace de suivi et vous le retrouvez ici après l'analyse antivirus.">
          {requests.status === "success" ? (
            <DocumentRequestsPanel channel={channel} leadAssignmentId={leadAssignmentId} data={requests.data} canMutate={canMutate} tenantReadOnly={tenantReadOnly} />
          ) : (
            <Notice tone="warning">Demandes de documents temporairement indisponibles.</Notice>
          )}
        </Card>
      </Stack>
    </div>
  );
}
