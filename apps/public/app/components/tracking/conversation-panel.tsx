"use client";

import { useEffect, useId, useRef, useState } from "react";
import { leadMessagingNotice, type LeadConversationView, type LeadMessageView } from "../../../../../packages/shared/contracts/lead-messaging";
import {
  canCompose,
  fillTemplate,
  formatDateTime,
  groupMessages,
  humanFileSize,
  markBrokerMessagesRead,
  mergeMessages,
  readOnlyReasonKey,
  unreadBrokerMessageIds
} from "../../lib/messaging-helpers";
import { getVisitorConversation, markVisitorConversationRead, visitorAttachmentHref } from "../../lib/public-api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";
import { Notice } from "../ui/notice";
import { MessageComposeForm } from "./message-compose-form";
import type { MessagingLabels } from "./messaging-labels";

/**
 * Spec 062 US2: the visitor's conversations on the tracking space, one thread per broker. Messages
 * are plain text (never HTML, never auto-linked; line breaks are kept by CSS only). The broker's
 * messages are marked read when the thread is shown, best effort. There is no live channel: the
 * visitor refreshes by hand. A thread is writable only while the API says so; otherwise a banner
 * states why it is read-only and the history stays readable.
 */
export interface ConversationPanelProps {
  publicReference: string;
  token: string;
  locale: string;
  /** Global switch of the messaging: off means history only. */
  messagingEnabled: boolean;
  conversations: readonly LeadConversationView[];
  labels: MessagingLabels;
}

export function ConversationPanel({ publicReference, token, locale, messagingEnabled, conversations, labels }: ConversationPanelProps) {
  const [unread, setUnread] = useState<Record<string, number>>(() => Object.fromEntries(conversations.map((conversation) => [conversation.conversationId, conversation.unreadCount])));
  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0);

  return (
    <div className="am-j-column" data-slot="visitor-conversations">
      <div className="am-section__header">
        <h2 className="am-section__title">
          {labels.title}
          {totalUnread > 0 ? (
            <>
              {" "}
              <Badge tone="new" dot>
                {totalUnread === 1 ? labels.unreadOne : fillTemplate(labels.unreadMany, { count: totalUnread })}
              </Badge>
            </>
          ) : null}
        </h2>
        <p className="am-section__lead">{labels.lead}</p>
      </div>
      <div className="am-stack am-stack--xl">
        {!messagingEnabled ? (
          <Notice tone="info" role="status">
            {labels.disabledNotice}
          </Notice>
        ) : null}
        {conversations.map((conversation) => (
          <ConversationThread
            key={conversation.conversationId}
            initial={conversation}
            publicReference={publicReference}
            token={token}
            locale={locale}
            messagingEnabled={messagingEnabled}
            labels={labels}
            onUnreadChange={(conversationId, count) => setUnread((current) => ({ ...current, [conversationId]: count }))}
          />
        ))}
      </div>
    </div>
  );
}

interface ThreadProps {
  initial: LeadConversationView;
  publicReference: string;
  token: string;
  locale: string;
  messagingEnabled: boolean;
  labels: MessagingLabels;
  onUnreadChange: (conversationId: string, count: number) => void;
}

type ThreadStatus = { kind: "ok" | "error"; text: string } | null;

const NON_REASON_KEYS = new Set(["title", "generic"]);

function ConversationThread({ initial, publicReference, token, locale, messagingEnabled, labels, onUnreadChange }: ThreadProps) {
  const headingId = useId();
  const conversationId = initial.conversationId;
  const [view, setView] = useState<LeadConversationView>(initial);
  const [messages, setMessages] = useState<LeadMessageView[]>(() => mergeMessages([], initial.messages));
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState<ThreadStatus>(null);
  const olderLoaded = useRef(false);
  const markedKey = useRef("");

  // Mark the broker messages read once they are shown (and again when new ones arrive). Best effort:
  // a refusal (read-only, messaging off) is ignored, the history stays readable either way.
  useEffect(() => {
    const ids = unreadBrokerMessageIds(messages);
    if (ids.length === 0) return;
    const key = ids.join(",");
    if (markedKey.current === key) return;
    markedKey.current = key;
    void markVisitorConversationRead(publicReference, conversationId, token).then((unreadCount) => {
      if (unreadCount === null) return;
      setMessages((current) => markBrokerMessagesRead(current, new Date().toISOString()));
      setView((current) => ({ ...current, unreadCount }));
      onUnreadChange(conversationId, unreadCount);
    });
  }, [messages, publicReference, conversationId, token, onUnreadChange]);

  async function refresh() {
    setRefreshing(true);
    setStatus(null);
    const result = await getVisitorConversation(publicReference, conversationId, token);
    setRefreshing(false);
    if (result.status === "failure") {
      setStatus({ kind: "error", text: labels.refreshFailed });
      return;
    }
    const fresh = result.data;
    setView(fresh);
    setMessages((current) => mergeMessages(current, fresh.messages));
    if (!olderLoaded.current) setCursor(fresh.nextCursor);
    onUnreadChange(conversationId, fresh.unreadCount);
    setStatus({ kind: "ok", text: labels.refreshed });
  }

  async function loadOlder() {
    if (!cursor) return;
    setLoadingOlder(true);
    setStatus({ kind: "ok", text: labels.loadingOlder });
    const result = await getVisitorConversation(publicReference, conversationId, token, cursor);
    setLoadingOlder(false);
    if (result.status === "failure") {
      setStatus({ kind: "error", text: labels.refreshFailed });
      return;
    }
    olderLoaded.current = true;
    setMessages((current) => mergeMessages(current, result.data.messages));
    setCursor(result.data.nextCursor);
    setStatus(null);
  }

  function handleSent(message: LeadMessageView | null) {
    if (message) setMessages((current) => mergeMessages(current, [message]));
    else void refresh();
  }

  const writable = canCompose({ messagingEnabled, state: view.state, canSend: view.canSend });
  const reasonKeys = Object.keys(labels.readOnly).filter((key) => !NON_REASON_KEYS.has(key));
  const reasonKey = readOnlyReasonKey({ messagingEnabled, readOnlyReason: view.readOnlyReason }, reasonKeys);
  const readOnlyText = (labels.readOnly as Record<string, string>)[reasonKey] ?? labels.readOnly.generic;
  const noticeLocale = locale === "en" ? "en" : "fr";
  const groups = groupMessages(messages);

  return (
    <article className="am-j-panel am-msg" aria-labelledby={headingId} data-conversation-id={conversationId} data-state={view.state}>
      <div className="am-j-panel__head">
        <IconTile name="message-circle" size="lg" />
        <h3 className="am-j-panel__title" id={headingId}>
          {fillTemplate(labels.threadLabel, { partnerName: view.partnerName })}
        </h3>
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => void refresh()}
          loading={refreshing}
          disabled={refreshing}
          icon={<Icon name="refresh" size={16} />}
        >
          {refreshing ? labels.refreshing : labels.refresh}
        </Button>
      </div>

      {/* The fixed non-contractual mention of the contract, in the language of the page. */}
      <Notice tone="indicative" role="note">
        {leadMessagingNotice(noticeLocale, view.partnerName)}
      </Notice>

      {cursor ? (
        <div className="am-cluster">
          <Button variant="secondary" size="sm" onClick={() => void loadOlder()} loading={loadingOlder} disabled={loadingOlder}>
            {labels.olderMessages}
          </Button>
        </div>
      ) : null}

      <div role="log" aria-live="polite" aria-relevant="additions" aria-label={fillTemplate(labels.messagesLabel, { partnerName: view.partnerName })}>
        {groups.length > 0 ? (
          <ol className="am-msg__list">
            {groups.map((group) => (
              <li className="am-msg__group" key={group.key} data-from={group.mine ? "visitor" : "broker"}>
                <p className="am-msg__who">
                  <strong>{group.mine ? labels.senderYou : labels.senderBroker}</strong>
                  <MessageTime locale={locale} value={group.messages[0]?.createdAt} />
                </p>
                {group.messages.map((message, index) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    showTime={index > 0}
                    publicReference={publicReference}
                    conversationId={conversationId}
                    token={token}
                    locale={locale}
                    labels={labels}
                  />
                ))}
              </li>
            ))}
          </ol>
        ) : (
          <p className="am-j-fineprint">{writable ? labels.noMessages : labels.noMessagesReadOnly}</p>
        )}
      </div>

      {status ? (
        <p className="am-msg__status" role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      ) : null}

      {writable ? (
        <MessageComposeForm
          publicReference={publicReference}
          conversationId={conversationId}
          token={token}
          labels={labels}
          onSent={handleSent}
          onBlocked={() => void refresh()}
        />
      ) : (
        <Notice tone="info" role="status" title={labels.readOnly.title}>
          {readOnlyText}
        </Notice>
      )}
    </article>
  );
}

function MessageTime({ locale, value }: { locale: string; value: string | null | undefined }) {
  const text = formatDateTime(locale, value);
  if (!value || !text) return null;
  // Rendered in the browser's time zone: the server pass may differ, hence the hydration allowance.
  return (
    <time className="am-msg__time" dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  );
}

interface MessageItemProps {
  message: LeadMessageView;
  showTime: boolean;
  publicReference: string;
  conversationId: string;
  token: string;
  locale: string;
  labels: MessagingLabels;
}

function MessageItem({ message, showTime, publicReference, conversationId, token, locale, labels }: MessageItemProps) {
  const readAt = message.mine ? formatDateTime(locale, message.readAt) : null;
  return (
    <div className="am-msg__item" data-message-id={message.id}>
      {showTime ? <MessageTime locale={locale} value={message.createdAt} /> : null}
      {/* Plain text only: React escapes it, CSS keeps the line breaks, nothing is turned into a link. */}
      <p className="am-msg__body">{message.body}</p>
      {message.attachments.length > 0 ? (
        <ul className="am-msg__files" aria-label={labels.attachmentsLabel}>
          {message.attachments.map((attachment) => {
            const size = humanFileSize(attachment.sizeBytes);
            return (
              <li className="am-msg__file" key={attachment.id}>
                <Icon name="paperclip" size={16} />
                <a
                  className="am-msg__file-name"
                  href={visitorAttachmentHref(publicReference, conversationId, message.id, attachment.id, token)}
                  rel="noreferrer nofollow"
                  referrerPolicy="no-referrer"
                  aria-label={fillTemplate(labels.attachmentDownload, { fileName: attachment.fileName })}
                  download
                >
                  {attachment.fileName}
                </a>
                <span className="am-msg__muted">({fillTemplate(size.unit === "kb" ? labels.sizeKb : labels.sizeMb, { value: size.value })})</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {message.mine && message.readAt ? (
        <p className="am-msg__receipt" title={readAt ? fillTemplate(labels.readReceiptAt, { date: readAt }) : undefined}>
          <Icon name="check" size={14} />
          {labels.readReceipt}
        </p>
      ) : null}
    </div>
  );
}
