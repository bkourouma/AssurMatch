import {
  LEAD_MESSAGE_ATTACHMENTS_MAX,
  LEAD_MESSAGE_ATTACHMENT_MAX_BYTES,
  LEAD_MESSAGE_ATTACHMENT_MIME_TYPES,
  type LeadMessageView
} from "../../../../packages/shared/contracts/lead-messaging";

/**
 * Spec 062: pure helpers of the visitor messaging, document-request and data-request surfaces.
 * They hold no state and import nothing from Next or React, so the specs can run them directly.
 * The API stays the authority: every check here is a hint that spares the visitor a round trip.
 */

/** Why a write of the visitor was refused, whatever the surface (message, upload, data request). */
export type MessagingFailure =
  | "rate_limited"
  | "read_only"
  | "disabled"
  | "duplicate"
  | "thread_limit"
  | "not_open"
  | "already_open"
  | "quarantined"
  | "invalid_document"
  | "too_large"
  | "invalid"
  | "denied"
  | "error";

/**
 * Maps an API refusal to a failure the interface can word. `code` is the `code` field of the API
 * error body when there is one. Anything unforeseen is a plain `error`.
 */
export function mapMessagingFailure(status: number, code?: string | null): MessagingFailure {
  if (status === 429) return "rate_limited";
  if (code === "MESSAGING_DISABLED") return "disabled";
  if (code === "VISITOR_ACCESS_DENIED" || status === 404 || status === 401) return "denied";
  if (status === 413) return "too_large";
  if (code === "CONVERSATION_READ_ONLY") return "read_only";
  if (code === "DUPLICATE_MESSAGE") return "duplicate";
  if (code === "THREAD_LIMIT_REACHED") return "thread_limit";
  if (code === "DOCUMENT_REQUEST_NOT_OPEN") return "not_open";
  if (code === "DATA_REQUEST_ALREADY_OPEN") return "already_open";
  if (code === "DOCUMENT_QUARANTINED") return "quarantined";
  if (code === "DOCUMENT_INVALID") return "invalid_document";
  if (status === 403) return "denied";
  if (status === 400 || status === 422) return "invalid";
  return "error";
}

/** Replaces `{name}` placeholders; an unknown placeholder is left as written. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

// ---------------------------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------------------------

export interface AttachmentCandidate {
  name: string;
  size: number;
  type: string;
}

export type AttachmentIssue =
  | { kind: "too_many"; max: number }
  | { kind: "too_large"; fileName: string }
  | { kind: "type"; fileName: string }
  | { kind: "empty"; fileName: string };

/** Types the visitor may attach, taken from the shared contract. */
export const ATTACHMENT_ACCEPT = LEAD_MESSAGE_ATTACHMENT_MIME_TYPES.join(",");

function allowedType(file: AttachmentCandidate): boolean {
  if ((LEAD_MESSAGE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) return true;
  // Some browsers leave the type empty: fall back on the extension (the server decides anyway).
  return file.type === "" && /\.(pdf|jpe?g|png)$/i.test(file.name);
}

/** Client-side hints for a selection of files: count, size, type and emptiness. */
export function validateAttachments(files: readonly AttachmentCandidate[], max: number = LEAD_MESSAGE_ATTACHMENTS_MAX): AttachmentIssue[] {
  const issues: AttachmentIssue[] = [];
  if (files.length > max) issues.push({ kind: "too_many", max });
  for (const file of files) {
    if (file.size <= 0) issues.push({ kind: "empty", fileName: file.name });
    else if (file.size > LEAD_MESSAGE_ATTACHMENT_MAX_BYTES) issues.push({ kind: "too_large", fileName: file.name });
    else if (!allowedType(file)) issues.push({ kind: "type", fileName: file.name });
  }
  return issues;
}

/** Size in kilobytes (below 1 MB) or megabytes with one decimal, as a value and a unit. */
export function humanFileSize(bytes: number): { value: number; unit: "kb" | "mb" } {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe < 1024 * 1024) return { value: Math.max(1, Math.ceil(safe / 1024)), unit: "kb" };
  return { value: Math.round((safe / (1024 * 1024)) * 10) / 10, unit: "mb" };
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

function compareMessages(left: LeadMessageView, right: LeadMessageView): number {
  const byDate = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (byDate !== 0 && !Number.isNaN(byDate)) return byDate;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Merges a fetched page into the messages already shown: no duplicate (the fetched copy wins, it
 * carries the latest read receipt), chronological order (creation time, then id), as the API sorts.
 */
export function mergeMessages(current: readonly LeadMessageView[], incoming: readonly LeadMessageView[]): LeadMessageView[] {
  const byId = new Map<string, LeadMessageView>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages);
}

/** Broker messages the visitor has not read yet (the ones the read call acknowledges). */
export function unreadBrokerMessageIds(messages: readonly LeadMessageView[]): string[] {
  return messages.filter((message) => message.senderType === "broker" && !message.mine && message.readAt === null).map((message) => message.id);
}

/** Marks broker messages as read locally once the API acknowledged the read. */
export function markBrokerMessagesRead(messages: readonly LeadMessageView[], readAt: string): LeadMessageView[] {
  return messages.map((message) => (message.senderType === "broker" && message.readAt === null ? { ...message, readAt } : message));
}

export interface MessageGroup {
  key: string;
  senderType: LeadMessageView["senderType"];
  mine: boolean;
  messages: LeadMessageView[];
}

/** Consecutive messages of the same sender within this window share one header. */
export const MESSAGE_GROUP_WINDOW_MINUTES = 5;

/** Groups consecutive messages of one sender sent close together, so the sender is not repeated. */
export function groupMessages(messages: readonly LeadMessageView[], windowMinutes: number = MESSAGE_GROUP_WINDOW_MINUTES): MessageGroup[] {
  const groups: MessageGroup[] = [];
  const windowMs = windowMinutes * 60_000;
  for (const message of messages) {
    const last = groups[groups.length - 1];
    const previous = last?.messages[last.messages.length - 1];
    const sameSender = last && previous && last.senderType === message.senderType && last.mine === message.mine;
    const close = previous ? Date.parse(message.createdAt) - Date.parse(previous.createdAt) <= windowMs : false;
    if (last && sameSender && close) {
      last.messages.push(message);
    } else {
      groups.push({ key: message.id, senderType: message.senderType, mine: message.mine, messages: [message] });
    }
  }
  return groups;
}

/** Idempotency key of a send (`clientRequestId`: 8 to 64 URL-safe characters). */
export function newClientRequestId(cryptoLike: { randomUUID?: () => string } | undefined = typeof crypto === "undefined" ? undefined : crypto): string {
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  // Insecure context (plain http on a LAN) has no randomUUID: a time and random based key is enough.
  const random = Math.random().toString(36).slice(2, 12);
  return `req-${Date.now().toString(36)}-${random}`;
}

/** Whether the visitor may write: the API flag, the conversation state and the global switch agree. */
export function canCompose(input: { messagingEnabled: boolean; state: string; canSend: boolean }): boolean {
  return input.messagingEnabled && input.state === "open" && input.canSend;
}

/**
 * Key of the read-only banner. A conversation that cannot be written to without a stated reason
 * gets the generic wording; a globally disabled messaging always wins.
 */
export function readOnlyReasonKey(
  input: { messagingEnabled: boolean; readOnlyReason: string | null },
  known: readonly string[]
): string {
  if (!input.messagingEnabled) return "messaging_disabled";
  return input.readOnlyReason !== null && known.includes(input.readOnlyReason) ? input.readOnlyReason : "generic";
}

export interface AttachmentIssueTemplates {
  tooMany: string;
  tooLarge: string;
  type: string;
  empty: string;
}

/** The sentence for one attachment issue, from the `fileErrors` templates of the catalogue. */
export function describeAttachmentIssue(issue: AttachmentIssue, templates: AttachmentIssueTemplates): string {
  switch (issue.kind) {
    case "too_many":
      return fillTemplate(templates.tooMany, { max: issue.max });
    case "too_large":
      return fillTemplate(templates.tooLarge, { fileName: issue.fileName });
    case "type":
      return fillTemplate(templates.type, { fileName: issue.fileName });
    case "empty":
      return fillTemplate(templates.empty, { fileName: issue.fileName });
  }
}

/** Looks a failure up in an `errors` catalogue, falling back on its generic `error` sentence. */
export function failureMessage(errors: Readonly<Record<string, string>>, failure: MessagingFailure): string {
  return errors[failure] ?? errors.error ?? "";
}

/** Date (and optionally time) in the page locale; null for a value that is not a date. */
export function formatDateTime(locale: string, value: string | null | undefined, withTime: boolean = true): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "long" }).format(date);
  } catch {
    return null;
  }
}
