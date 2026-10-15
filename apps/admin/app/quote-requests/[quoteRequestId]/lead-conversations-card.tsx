import { readAdminLeadConversations, type AdminConversationData } from "../../lib/admin-api";
import { Badge, Card, Stack, StateMessage } from "../../lib/ui/admin-ui";

/**
 * Spec 062: read-only view of the broker/visitor conversations of a quote request, for the
 * compliance and support roles. There is deliberately no input here: compliance never writes in a
 * conversation. Each consultation is audited by the API (`lead_messaging.admin_viewed`); for the
 * support role the API masks every message body and this card only shows metadata.
 */

const READ_ONLY_REASON_LABELS: Record<string, string> = {
  consent_withdrawn: "consentement retiré",
  lead_closed: "demande clôturée",
  reassigned: "demande réaffectée",
  messaging_disabled: "messagerie désactivée",
  partner_suspended: "partenaire suspendu",
  not_accepted: "demande non acceptée"
};

const SENDER_LABELS: Record<string, string> = { broker: "Courtier", visitor: "Visiteur" };

function formatDateTime(value: string | null | undefined): string {
  return value ? value.slice(0, 16).replace("T", " ") : "—";
}

function ConversationBlock({ conversation, masked }: { conversation: AdminConversationData; masked: boolean }) {
  const messages = [...conversation.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section aria-label={`Conversation avec ${conversation.partnerName}`}>
      <p>
        <strong>{conversation.partnerName}</strong>{" "}
        {conversation.state === "read_only" ? (
          <Badge tone="disabled">
            Lecture seule{conversation.readOnlyReason ? ` : ${READ_ONLY_REASON_LABELS[conversation.readOnlyReason] ?? conversation.readOnlyReason}` : ""}
          </Badge>
        ) : (
          <Badge tone="info">Ouverte</Badge>
        )}
      </p>
      {messages.length === 0 ? (
        <p>Aucun message dans cette conversation.</p>
      ) : (
        <ol className="bo-list">
          {messages.map((message) => (
            <li key={message.id}>
              <strong>{SENDER_LABELS[message.senderType] ?? message.senderType}</strong> — {formatDateTime(message.createdAt)}
              {message.readAt ? ` — lu le ${formatDateTime(message.readAt)}` : " — non lu"}
              {masked || message.bodyMasked || message.body === null ? (
                <p data-conversation-marker="body-masked">Contenu masqué pour votre rôle (support)</p>
              ) : (
                <p className="bo-break">{message.body}</p>
              )}
              {message.attachmentCount && message.attachmentCount > 0 ? (
                <p>{message.attachmentCount === 1 ? "1 pièce jointe" : `${message.attachmentCount} pièces jointes`} (noms non affichés)</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export async function LeadConversationsCard({ quoteRequestId, show }: { quoteRequestId: string; show: boolean }) {
  if (!show) {
    return (
      <Card
        title="Échanges courtier / visiteur"
        description="Lecture seule. Les échanges ne sont pas chargés avec la fiche : chaque consultation est enregistrée dans le journal d'audit."
      >
        <Stack>
          <p>Le contenu des échanges est consulté uniquement à la demande. L&apos;affichage ci-dessous est une consultation auditée.</p>
          <p>
            <a href={`/quote-requests/${encodeURIComponent(quoteRequestId)}?conversations=1`} data-conversation-marker="load-audited">
              Afficher les échanges (consultation auditée)
            </a>
          </p>
        </Stack>
      </Card>
    );
  }
  const result = await readAdminLeadConversations(quoteRequestId);
  const conversations = Array.isArray(result.data.conversations) ? result.data.conversations : [];
  const masked = result.data.masked === true;

  return (
    <Card
      title="Échanges courtier / visiteur"
      description="Lecture seule. Chaque consultation de cette section est enregistrée dans le journal d'audit."
    >
      <Stack>
        {result.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
        {result.forbidden ? (
          <StateMessage tone="warning">Les échanges courtier / visiteur ne sont pas accessibles pour ce rôle admin (refus audité).</StateMessage>
        ) : null}
        {result.status === "error" ? <StateMessage tone="danger">Échanges indisponibles : {result.error}</StateMessage> : null}
        {masked ? <StateMessage tone="info">Contenu masqué pour votre rôle (support) : seuls l&apos;expéditeur, les horodatages et le nombre de pièces jointes sont visibles.</StateMessage> : null}
        {result.status === "success" && conversations.length === 0 ? <p>Aucune conversation pour cette demande.</p> : null}
        {conversations.map((conversation) => (
          <ConversationBlock key={conversation.conversationId} conversation={conversation} masked={masked} />
        ))}
      </Stack>
    </Card>
  );
}
