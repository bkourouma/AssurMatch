import { getMessages } from "next-intl/server";
import type { LeadConversationView } from "../../../../../packages/shared/contracts/lead-messaging";
import { getVisitorConversation, listVisitorConversations, listVisitorDataRequests, listVisitorDocumentRequests } from "../../lib/public-api";
import { Badge } from "../ui/badge";
import { Notice } from "../ui/notice";
import { Section } from "../ui/section";
import { ConversationPanel } from "./conversation-panel";
import { DataRequestPanel } from "./data-request-panel";
import { DocumentRequestsPanel } from "./document-requests-panel";
import type { DataRequestLabels, DocumentRequestLabels, MessagingLabels } from "./messaging-labels";
import "../../styles/pages/messaging.css";

/**
 * Spec 062: the three sections of the tracking space between the proposals and the documents of the
 * request: the conversations with the brokers, the documents they asked for and the visitor's own
 * data requests. Everything is read with the visitor token (`?token=`, spec 054); every refusal of
 * the API is neutral, so a failed read shows one polite message and never the reason. The data
 * requests section does not depend on the messaging switch (a right of the visitor).
 */
export interface MessagingSectionsProps {
  publicReference: string;
  token: string;
  locale: string;
  /** `messaging` of the tracking status view; absent on a payload that predates spec 062. */
  summary: { enabled: boolean; unreadCount: number } | undefined;
  consentWithdrawn: boolean;
}

/** More threads than this never happen (one per broker of the request); a hard cap keeps the page light. */
const MAX_THREADS = 10;

export async function MessagingSections({ publicReference, token, locale, summary, consentWithdrawn }: MessagingSectionsProps) {
  // The client boundary ships no `QuoteRequest` namespace: the three subtrees travel as props.
  const messages = (await getMessages()) as unknown as { QuoteRequest: { messaging: MessagingLabels; documentRequests: DocumentRequestLabels; dataRequests: DataRequestLabels } };
  const { messaging: messagingLabels, documentRequests: documentLabels, dataRequests: dataLabels } = messages.QuoteRequest;

  const [list, documentRequests, dataRequests] = await Promise.all([
    listVisitorConversations(publicReference, token),
    listVisitorDocumentRequests(publicReference, token),
    listVisitorDataRequests(publicReference, token)
  ]);

  // One full thread per conversation of the summary list (the list only carries the last message).
  let conversations: LeadConversationView[] = [];
  let conversationsFailed = list.status === "failure";
  if (list.status === "success") {
    const threads = await Promise.all(
      list.data.conversations.slice(0, MAX_THREADS).map((summaryItem) => getVisitorConversation(publicReference, summaryItem.conversationId, token))
    );
    conversations = threads.flatMap((thread) => (thread.status === "success" ? [thread.data] : []));
    if (conversations.length < Math.min(list.data.conversations.length, MAX_THREADS)) conversationsFailed = true;
  }
  const messagingEnabled = list.status === "success" ? list.data.messagingEnabled : (summary?.enabled ?? false);
  const unreadFallback = summary?.unreadCount ?? 0;

  return (
    <>
      {conversationsFailed || conversations.length > 0 || (messagingEnabled && !consentWithdrawn) ? (
        <Section id="conversation" ariaLabel={messagingLabels.title}>
          {conversations.length > 0 ? (
            <div className="am-stack am-stack--lg">
              <ConversationPanel
                publicReference={publicReference}
                token={token}
                locale={locale}
                messagingEnabled={messagingEnabled}
                conversations={conversations}
                labels={messagingLabels}
              />
              {conversationsFailed ? (
                <Notice tone="error" role="alert">
                  {messagingLabels.loadError}
                </Notice>
              ) : null}
            </div>
          ) : (
            <div className="am-stack am-stack--lg am-j-column">
              <div className="am-section__header">
                <h2 className="am-section__title">{messagingLabels.title}</h2>
                <p className="am-section__lead">{messagingLabels.lead}</p>
                {conversationsFailed && unreadFallback > 0 ? (
                  <div className="am-section__actions">
                    <Badge tone="new" dot>
                      {unreadFallback === 1 ? messagingLabels.unreadOne : messagingLabels.unreadMany.replace("{count}", String(unreadFallback))}
                    </Badge>
                  </div>
                ) : null}
              </div>
              {conversationsFailed ? (
                <Notice tone="error" role="alert">
                  {messagingLabels.loadError}
                </Notice>
              ) : (
                <p className="am-j-fineprint">{messagingLabels.empty}</p>
              )}
            </div>
          )}
        </Section>
      ) : null}

      {documentRequests.status === "failure" || documentRequests.data.items.length > 0 ? (
        <Section id="documents-demandes" title={documentLabels.title} lead={documentLabels.lead} tone="muted">
          {documentRequests.status === "success" ? (
            <DocumentRequestsPanel
              publicReference={publicReference}
              token={token}
              locale={locale}
              messagingEnabled={messagingEnabled}
              items={documentRequests.data.items}
              labels={documentLabels}
            />
          ) : (
            <div className="am-j-column">
              <Notice tone="error" role="alert">
                {documentLabels.loadError}
              </Notice>
            </div>
          )}
        </Section>
      ) : null}

      <Section id="mes-donnees" title={dataLabels.title} lead={dataLabels.lead}>
        <DataRequestPanel
          publicReference={publicReference}
          token={token}
          locale={locale}
          items={dataRequests.status === "success" ? dataRequests.data.items : null}
          labels={dataLabels}
        />
      </Section>
    </>
  );
}
