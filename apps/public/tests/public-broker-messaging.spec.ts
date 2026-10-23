import { expect, test } from "@playwright/test";
import {
  ATTACHMENT_ACCEPT,
  canCompose,
  describeAttachmentIssue,
  failureMessage,
  fillTemplate,
  formatDateTime,
  groupMessages,
  humanFileSize,
  mapMessagingFailure,
  markBrokerMessagesRead,
  mergeMessages,
  newClientRequestId,
  readOnlyReasonKey,
  unreadBrokerMessageIds,
  validateAttachments
} from "../app/lib/messaging-helpers";
import type { LeadMessageView } from "../../../packages/shared/contracts/lead-messaging";
import { messagesJson, publicFile, publicPage, readSources } from "./helpers/public-sources";

/** Spec 062 T019-T022: conversations, requested documents and data requests on the tracking space. */

const trackingPage = publicPage("quote-requests/[publicReference]/page.tsx");
const sections = publicFile("components/tracking/messaging-sections.tsx");
const conversation = publicFile("components/tracking/conversation-panel.tsx");
const compose = publicFile("components/tracking/message-compose-form.tsx");
const picker = publicFile("components/tracking/file-picker.tsx");
const documents = publicFile("components/tracking/document-requests-panel.tsx");
const dataRequests = publicFile("components/tracking/data-request-panel.tsx");
const attachmentRoute = publicFile("api/quote-requests/[publicReference]/conversations/[conversationId]/messages/[messageId]/attachments/[attachmentId]/route.ts");
const helpers = publicFile("lib/messaging-helpers.ts");
const api = publicFile("lib/public-api.ts");
const stylesheet = publicFile("styles/pages/messaging.css");

const components = [sections, conversation, compose, picker, documents, dataRequests];
const NAMESPACES = ["messaging", "documentRequests", "dataRequests"] as const;

type Messages = Record<string, unknown>;

function namespace(locale: "fr" | "en", name: (typeof NAMESPACES)[number]): Messages {
  return (messagesJson(locale).QuoteRequest as Messages)[name] as Messages;
}

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [];
}

function keyPaths(value: unknown, prefix = ""): string[] {
  return value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
    : [prefix];
}

function message(overrides: Partial<LeadMessageView> & { id: string; createdAt: string }): LeadMessageView {
  return { senderType: "broker", mine: false, body: "Bonjour", readAt: null, attachments: [], ...overrides };
}

// ---------------------------------------------------------------------------------------------
// Source markers
// ---------------------------------------------------------------------------------------------

test("the tracking page mounts the three sections between the proposals and the documents", () => {
  const page = readSources([trackingPage]);
  const mount = page.indexOf("<MessagingSections");
  expect(mount).toBeGreaterThan(page.indexOf("</QuoteProposalsSlot>"));
  expect(mount).toBeLessThan(page.indexOf('<Section title={t("documentsTitle")}'));
  expect(page).toContain("summary={view.messaging}");
  expect(page).toContain("consentWithdrawn={view.consent.withdrawn}");
});

test("the server component reads conversations, document requests and data requests with the token", () => {
  const source = readSources([sections]);
  for (const marker of [
    "listVisitorConversations(publicReference, token)",
    "listVisitorDocumentRequests(publicReference, token)",
    "listVisitorDataRequests(publicReference, token)",
    "getVisitorConversation(publicReference, summaryItem.conversationId, token)",
    "<ConversationPanel",
    "<DocumentRequestsPanel",
    "<DataRequestPanel"
  ]) {
    expect(source).toContain(marker);
  }
  // The data requests section never depends on the messaging switch nor on the consent.
  const dataSection = source.slice(source.indexOf('id="mes-donnees"'));
  expect(dataSection).not.toContain("messagingEnabled");
  expect(dataSection).not.toContain("consentWithdrawn");
});

test("the API client calls the contract routes with the visitor token and no session", () => {
  const source = readSources([api]);
  for (const route of [
    '"/conversations"',
    "`/conversations/${encodeURIComponent(conversationId)}`",
    "/messages`",
    "/read`",
    "/attachments/${encodeURIComponent(attachmentId)}",
    '"/document-requests"',
    "/document-requests/${encodeURIComponent(requestId)}/documents",
    '"/data-requests"'
  ]) {
    expect(source).toContain(route);
  }
  expect(source).toContain("new URLSearchParams({ token, ...extra })");
  expect(source).toContain('form.append("payload", JSON.stringify(payload))');
  expect(source).toContain('form.append("files", file, file.name)');
  expect(source).toContain("export function visitorAttachmentHref");
  // No session, no cookie: the token in the tracking URL is the only credential.
  expect(source).not.toMatch(/credentials:\s*"include"/);
});

test("the attachment proxy keeps the token server-side, streams no-store and answers a neutral 404", () => {
  const route = readSources([attachmentRoute]);
  expect(route).toContain("export async function GET(");
  // The visitor's address is forwarded so the API's per-IP download limit applies per visitor.
  expect(route).toContain("fetchVisitorMessageAttachment(publicReference, conversationId, messageId, attachmentId, token, visitorForwardedFor(request.headers))");
  expect(readSources([api])).toContain('"x-forwarded-for": forwardedFor');
  expect(route).toContain('"Cache-Control": "no-store"');
  expect(route).toContain('"X-Content-Type-Options": "nosniff"');
  expect(route).toContain('"Referrer-Policy": "no-referrer"');
  expect(route).toContain("return neutral(404)");
  expect(route).toContain("attachment; filename=");
  // Only the three accepted types are served; anything else upstream is a 404.
  for (const type of ["application/pdf", "image/jpeg", "image/png"]) expect(route).toContain(`"${type}"`);
  expect(route).toContain("if (!extension) return neutral(404)");
  expect(readSources([conversation])).toContain("visitorAttachmentHref(publicReference, conversationId, message.id, attachment.id, token)");
  expect(readSources([conversation])).toContain('rel="noreferrer nofollow"');
});

test("messages are plain text: no HTML injection, no auto-linking, line breaks kept by CSS", () => {
  const source = readSources(components);
  expect(source).not.toContain("dangerouslySetInnerHTML");
  expect(source).not.toContain("innerHTML");
  expect(source).not.toMatch(/linkify|autolink/i);
  expect(source).toContain("<p className=\"am-msg__body\">{message.body}</p>");
  expect(readSources([stylesheet])).toMatch(/\.am-msg__body\s*\{[^}]*white-space:\s*pre-wrap/);
});

test("the conversation shows sender, time, read receipt, attachments, the fixed notice and a manual refresh", () => {
  const source = readSources([conversation]);
  for (const marker of [
    "labels.senderYou",
    "labels.senderBroker",
    "<time",
    "labels.readReceipt",
    "message.attachments.map",
    "leadMessagingNotice(",
    "getVisitorConversation(publicReference, conversationId, token)",
    "labels.refresh",
    "labels.olderMessages",
    'role="log"',
    'aria-live="polite"'
  ]) {
    expect(source).toContain(marker);
  }
  // Broker messages are marked read when the thread is shown (best effort).
  expect(source).toContain("markVisitorConversationRead(publicReference, conversationId, token)");
  expect(source).toContain("unreadBrokerMessageIds(messages)");
  // No websocket, no polling timer: the visitor refreshes by hand.
  expect(source).not.toMatch(/WebSocket|EventSource|setInterval/);
});

test("the unread badge sits in the conversation section title", () => {
  const source = readSources([conversation]);
  expect(source).toContain('<h2 className="am-section__title">');
  expect(source).toContain("<Badge tone=\"new\" dot>");
  expect(source).toContain("labels.unreadOne");
  expect(source).toContain("labels.unreadMany");
});

test("a read-only or disabled conversation shows its reason and no compose form", () => {
  const source = readSources([conversation]);
  expect(source).toContain("canCompose({ messagingEnabled, state: view.state, canSend: view.canSend })");
  expect(source).toContain("readOnlyReasonKey(");
  expect(source).toContain("labels.readOnly.title");
  expect(source).toContain("{writable ? (");
  expect(source).toContain("labels.disabledNotice");
  const reasons = Object.keys(namespace("fr", "messaging").readOnly as Messages);
  for (const reason of ["consent_withdrawn", "lead_closed", "reassigned", "messaging_disabled", "not_accepted", "partner_suspended", "generic"]) {
    expect(reasons).toContain(reason);
  }
});

test("the message form has a counter, a honeypot, an idempotency key, attachments and loading states", () => {
  const source = readSources([compose]);
  for (const marker of [
    "maxLength={LEAD_MESSAGE_BODY_MAX}",
    "labels.counter",
    'name="website"',
    'tabIndex={-1}',
    'aria-hidden="true"',
    "newClientRequestId()",
    "clientRequestId: requestId.current",
    "<FilePicker",
    "LEAD_MESSAGE_ATTACHMENTS_MAX",
    "loading={sending}",
    "disabled={sending}",
    "validateAttachments(files, LEAD_MESSAGE_ATTACHMENTS_MAX)",
    "failureMessage(labels.errors, failure)",
    'role="alert"',
    'role="status"'
  ]) {
    expect(source).toContain(marker);
  }
  // The key is reused for a retry of the same message and renewed when the message changes.
  expect(source).toContain("requestId.current ??= newClientRequestId()");
  expect(source).toContain("requestId.current = null");
});

test("the honeypot is invisible to people and assistive technology but not removed from the DOM", () => {
  const css = readSources([stylesheet]);
  expect(css).toMatch(/\.am-msg__trap\s*\{[^}]*position:\s*absolute[^}]*left:\s*-10000px/);
  expect(css).not.toMatch(/\.am-msg__trap\s*\{[^}]*display:\s*none/);
  for (const form of [compose, dataRequests]) expect(readSources([form])).toContain('className="am-msg__trap"');
});

test("the file picker states the hints and offers a remove button per file", () => {
  const source = readSources([picker]);
  expect(source).toContain("accept={ATTACHMENT_ACCEPT}");
  expect(source).toContain("multiple");
  expect(source).toContain("validateAttachments(files, max)");
  expect(source).toContain("aria-label={fillTemplate(labels.removeFile");
  expect(ATTACHMENT_ACCEPT).toBe("application/pdf,image/jpeg,image/png");
});

test("requested documents: open requests get a multi-file upload, the others a note", () => {
  const source = readSources([documents]);
  for (const marker of [
    "item.status === \"open\" && item.canUpload && messagingEnabled",
    "uploadRequestedDocuments(publicReference, item.id, token, files)",
    "DOCUMENT_REQUEST_UPLOAD_FILES_MAX",
    "labels.noFile",
    "labels.cancelledBody",
    "labels.fulfilledBody",
    "labels.uploadDisabled",
    "failureMessage(labels.errors, failure)",
    "listVisitorDocumentRequests(publicReference, token)"
  ]) {
    expect(source).toContain(marker);
  }
  // A provided document confirms nothing: no validation green on these statuses.
  expect(source).not.toContain('"approved"');
});

test("data requests: type choice, detail, honeypot, reference confirmation, duplicate and list", () => {
  const source = readSources([dataRequests]);
  for (const marker of [
    "DATA_REQUEST_TYPES.map",
    'type="radio"',
    "maxLength={DATA_REQUEST_DETAIL_MAX}",
    'name="website"',
    "createVisitorDataRequest(publicReference, token, { type, detail, website })",
    "labels.confirmTitle",
    "labels.confirmBody",
    "errors.already_open",
    "result.existingReference ?? openReferenceOf(type)",
    "labels.listEmpty",
    "labels.howErasure"
  ]) {
    expect(source).toContain(marker);
  }
  // Nothing is preselected: filing an erasure is always a deliberate choice.
  expect(source).toContain('useState<DataRequestType | "">("")');
  expect(source).toContain("labels.typeRequired");
});

test("no component imports back-office code or route strings", () => {
  const sources = readSources([...components, attachmentRoute, helpers, api]);
  for (const forbidden of ["backoffice-auth", "broker-api", "admin-api", "/broker/", "/admin/", "/auth/me"]) {
    expect(sources).not.toContain(forbidden);
  }
  expect(sources).not.toMatch(/apps\/(admin|broker|backoffice)|@assurmatch\/(admin|broker)/);
});

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

test("messaging, document request and data request copy exist in FR and EN with identical keys", () => {
  for (const name of NAMESPACES) {
    expect(keyPaths(namespace("fr", name)).sort(), name).toEqual(keyPaths(namespace("en", name)).sort());
    expect(leaves(namespace("fr", name)).length).toBeGreaterThan(10);
  }
});

test("the French copy keeps its accents and neither language uses a curly apostrophe or an empty value", () => {
  const fr = NAMESPACES.flatMap((name) => leaves(namespace("fr", name))).join("\n");
  const en = NAMESPACES.flatMap((name) => leaves(namespace("en", name)));
  for (const accented of ["Écrivez", "Conversation avec votre courtier", "Documents demandés", "Réponse attendue", "Clôturée", "Pièces jointes", "analysé"]) {
    expect(fr, accented).toContain(accented);
  }
  // The unaccented forms of the words above must not slip in.
  for (const unaccented of ["Ecrivez", "Reponse attendue", "Cloturee", "pieces jointes", "analyse avant"]) {
    expect(fr, unaccented).not.toContain(unaccented);
  }
  for (const value of [...fr.split("\n"), ...en]) {
    expect(value.trim().length).toBeGreaterThan(0);
    expect(value).not.toContain("’");
  }
});

test("the catalogue never promises a purchase, a contract or an accepted cover", () => {
  const catalogue = (["fr", "en"] as const).flatMap((locale) => NAMESPACES.flatMap((name) => leaves(namespace(locale, name)))).join("\n").toLowerCase();
  const sources = readSources([...components, helpers]).toLowerCase();
  for (const forbidden of [
    "acheter",
    "souscrire",
    "souscrivez",
    "contrat valide",
    "contrat validé",
    "garantie acceptée",
    "garanti",
    "buy now",
    "subscribe",
    "accept the contract",
    "valid contract",
    "guaranteed",
    "soon",
    "bientôt",
    "immédiat"
  ]) {
    expect(catalogue, forbidden).not.toContain(forbidden);
    if (!["garanti", "guaranteed", "soon", "immédiat"].includes(forbidden)) expect(sources, forbidden).not.toContain(forbidden);
  }
});

test("erasure is described as reviewed by compliance, never automatic, in both languages", () => {
  expect((namespace("fr", "dataRequests") as Record<string, string>).howErasure).toContain("n'est jamais exécutée automatiquement");
  expect((namespace("en", "dataRequests") as Record<string, string>).howErasure).toContain("never carried out automatically");
  const source = readSources([dataRequests]);
  expect(source).toContain("nothing is ever");
  expect(source).toContain("erased from here");
});

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

test("API refusals are mapped to a failure the visitor can read", () => {
  expect(mapMessagingFailure(429)).toBe("rate_limited");
  expect(mapMessagingFailure(409, "CONVERSATION_READ_ONLY")).toBe("read_only");
  expect(mapMessagingFailure(409, "MESSAGING_DISABLED")).toBe("disabled");
  expect(mapMessagingFailure(403, "MESSAGING_DISABLED")).toBe("disabled");
  expect(mapMessagingFailure(409, "DUPLICATE_MESSAGE")).toBe("duplicate");
  expect(mapMessagingFailure(409, "THREAD_LIMIT_REACHED")).toBe("thread_limit");
  expect(mapMessagingFailure(409, "DOCUMENT_REQUEST_NOT_OPEN")).toBe("not_open");
  expect(mapMessagingFailure(409, "DATA_REQUEST_ALREADY_OPEN")).toBe("already_open");
  expect(mapMessagingFailure(422, "DOCUMENT_QUARANTINED")).toBe("quarantined");
  expect(mapMessagingFailure(422, "DOCUMENT_INVALID")).toBe("invalid_document");
  expect(mapMessagingFailure(404, "VISITOR_ACCESS_DENIED")).toBe("denied");
  expect(mapMessagingFailure(404)).toBe("denied");
  expect(mapMessagingFailure(413)).toBe("too_large");
  expect(mapMessagingFailure(400)).toBe("invalid");
  expect(mapMessagingFailure(422)).toBe("invalid");
  expect(mapMessagingFailure(500)).toBe("error");
  expect(mapMessagingFailure(409, "SOMETHING_ELSE")).toBe("error");
});

test("every failure of a send has a sentence in both languages, with the generic one as fallback", () => {
  for (const locale of ["fr", "en"] as const) {
    const errors = namespace(locale, "messaging").errors as Record<string, string>;
    for (const failure of ["rate_limited", "read_only", "disabled", "duplicate", "thread_limit", "quarantined", "invalid_document", "too_large", "invalid", "denied", "error"] as const) {
      expect(failureMessage(errors, failure).length, `${locale}:${failure}`).toBeGreaterThan(10);
    }
    expect(failureMessage(errors, "not_open")).toBe(errors.error);
  }
});

test("attachments are checked for count, size, type and emptiness", () => {
  const pdf = { name: "carte-grise.pdf", size: 1024, type: "application/pdf" };
  expect(validateAttachments([])).toEqual([]);
  expect(validateAttachments([pdf, { name: "a.jpg", size: 5 * 1024 * 1024, type: "image/jpeg" }, { name: "b.png", size: 10, type: "image/png" }])).toEqual([]);
  expect(validateAttachments([pdf, pdf, pdf, pdf])).toEqual([{ kind: "too_many", max: 3 }]);
  expect(validateAttachments([{ name: "gros.pdf", size: 5 * 1024 * 1024 + 1, type: "application/pdf" }])).toEqual([{ kind: "too_large", fileName: "gros.pdf" }]);
  expect(validateAttachments([{ name: "script.exe", size: 10, type: "application/octet-stream" }])).toEqual([{ kind: "type", fileName: "script.exe" }]);
  expect(validateAttachments([{ name: "vide.pdf", size: 0, type: "application/pdf" }])).toEqual([{ kind: "empty", fileName: "vide.pdf" }]);
  // An empty browser type falls back on the extension; the server stays the authority.
  expect(validateAttachments([{ name: "photo.JPG", size: 10, type: "" }])).toEqual([]);
  expect(validateAttachments([{ name: "notes.txt", size: 10, type: "" }])).toEqual([{ kind: "type", fileName: "notes.txt" }]);
  const templates = namespace("fr", "messaging").fileErrors as { tooMany: string; tooLarge: string; type: string; empty: string };
  expect(describeAttachmentIssue({ kind: "too_many", max: 3 }, templates)).toBe("Vous pouvez joindre 3 fichiers au maximum.");
  expect(describeAttachmentIssue({ kind: "too_large", fileName: "gros.pdf" }, templates)).toContain("gros.pdf");
});

test("file sizes read in kilobytes below 1 MB and in megabytes above", () => {
  expect(humanFileSize(1)).toEqual({ value: 1, unit: "kb" });
  expect(humanFileSize(1536)).toEqual({ value: 2, unit: "kb" });
  expect(humanFileSize(1024 * 1024)).toEqual({ value: 1, unit: "mb" });
  expect(humanFileSize(Math.round(2.55 * 1024 * 1024))).toEqual({ value: 2.6, unit: "mb" });
  expect(humanFileSize(Number.NaN)).toEqual({ value: 1, unit: "kb" });
});

test("templates are filled by name and unknown placeholders stay visible", () => {
  expect(fillTemplate("{count} / {max} caractères", { count: 12, max: 2000 })).toBe("12 / 2000 caractères");
  expect(fillTemplate("Échange avec {partnerName}", { partnerName: "Cabinet Test" })).toBe("Échange avec Cabinet Test");
  expect(fillTemplate("{a} {b}", { a: "x" })).toBe("x {b}");
});

test("pages of messages merge without duplicates, in chronological order, the fetched copy winning", () => {
  const first = message({ id: "m1", createdAt: "2026-10-01T10:00:00.000Z" });
  const second = message({ id: "m2", createdAt: "2026-10-01T10:05:00.000Z", senderType: "visitor", mine: true });
  const third = message({ id: "m3", createdAt: "2026-10-01T10:05:00.000Z" });
  const merged = mergeMessages([third, second], [first, { ...second, readAt: "2026-10-01T11:00:00.000Z" }]);
  expect(merged.map((item) => item.id)).toEqual(["m1", "m2", "m3"]);
  expect(merged[1]?.readAt).toBe("2026-10-01T11:00:00.000Z");
  expect(mergeMessages([], [])).toEqual([]);
});

test("unread broker messages are listed and marked read locally once acknowledged", () => {
  const messages = [
    message({ id: "b1", createdAt: "2026-10-01T10:00:00.000Z" }),
    message({ id: "b2", createdAt: "2026-10-01T10:01:00.000Z", readAt: "2026-10-01T10:02:00.000Z" }),
    message({ id: "v1", createdAt: "2026-10-01T10:03:00.000Z", senderType: "visitor", mine: true })
  ];
  expect(unreadBrokerMessageIds(messages)).toEqual(["b1"]);
  const read = markBrokerMessagesRead(messages, "2026-10-02T09:00:00.000Z");
  expect(read.map((item) => item.readAt)).toEqual(["2026-10-02T09:00:00.000Z", "2026-10-01T10:02:00.000Z", null]);
  expect(unreadBrokerMessageIds(read)).toEqual([]);
});

test("consecutive messages of one sender sent close together share a header", () => {
  const messages = [
    message({ id: "b1", createdAt: "2026-10-01T10:00:00.000Z" }),
    message({ id: "b2", createdAt: "2026-10-01T10:03:00.000Z" }),
    message({ id: "b3", createdAt: "2026-10-01T10:20:00.000Z" }),
    message({ id: "v1", createdAt: "2026-10-01T10:21:00.000Z", senderType: "visitor", mine: true }),
    message({ id: "v2", createdAt: "2026-10-01T10:22:00.000Z", senderType: "visitor", mine: true })
  ];
  const groups = groupMessages(messages);
  expect(groups.map((group) => group.messages.map((item) => item.id))).toEqual([["b1", "b2"], ["b3"], ["v1", "v2"]]);
  expect(groups.map((group) => group.mine)).toEqual([false, false, true]);
  expect(groupMessages([])).toEqual([]);
});

test("the idempotency key is URL-safe, 8 to 64 characters and falls back without randomUUID", () => {
  const pattern = /^[A-Za-z0-9_-]{8,64}$/;
  expect(newClientRequestId({ randomUUID: () => "123e4567-e89b-12d3-a456-426614174000" })).toMatch(pattern);
  const fallback = newClientRequestId({});
  expect(fallback).toMatch(pattern);
  expect(newClientRequestId({})).not.toBe(fallback);
  expect(newClientRequestId()).toMatch(pattern);
});

test("composing needs the switch on, an open conversation and the API's permission", () => {
  expect(canCompose({ messagingEnabled: true, state: "open", canSend: true })).toBe(true);
  expect(canCompose({ messagingEnabled: false, state: "open", canSend: true })).toBe(false);
  expect(canCompose({ messagingEnabled: true, state: "read_only", canSend: false })).toBe(false);
  expect(canCompose({ messagingEnabled: true, state: "open", canSend: false })).toBe(false);
  const known = ["consent_withdrawn", "lead_closed", "reassigned", "messaging_disabled", "partner_suspended", "not_accepted"];
  expect(readOnlyReasonKey({ messagingEnabled: false, readOnlyReason: "lead_closed" }, known)).toBe("messaging_disabled");
  expect(readOnlyReasonKey({ messagingEnabled: true, readOnlyReason: "lead_closed" }, known)).toBe("lead_closed");
  expect(readOnlyReasonKey({ messagingEnabled: true, readOnlyReason: null }, known)).toBe("generic");
  expect(readOnlyReasonKey({ messagingEnabled: true, readOnlyReason: "something_new" }, known)).toBe("generic");
});

test("dates are formatted in the page locale and an invalid value reads as nothing", () => {
  expect(formatDateTime("fr", "2026-10-14T12:00:00.000Z", false)).toContain("octobre");
  expect(formatDateTime("en", "2026-10-14T12:00:00.000Z", false)).toContain("October");
  expect(formatDateTime("fr", "2026-10-14T12:00:00.000Z")).toMatch(/\d{1,2}:\d{2}/);
  expect(formatDateTime("fr", "not a date")).toBeNull();
  expect(formatDateTime("fr", null)).toBeNull();
  expect(formatDateTime("fr", undefined)).toBeNull();
});
