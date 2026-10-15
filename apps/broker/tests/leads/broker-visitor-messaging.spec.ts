import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  CONVERSATION_NOTICES,
  DOCUMENT_REQUEST_LABEL_MAX,
  DOCUMENT_REQUEST_MAX_OPEN,
  DOCUMENT_REQUEST_NOTE_MAX,
  LEAD_MESSAGE_ATTACHMENTS_MAX,
  LEAD_MESSAGE_ATTACHMENT_MAX_BYTES,
  LEAD_MESSAGE_ATTACHMENT_MIME_TYPES,
  LEAD_MESSAGE_BODY_MAX,
  MESSAGING_NOTIFICATION_TYPE_LABELS,
  attachmentHref,
  buildDocumentRequestPayload,
  buildMessagePayload,
  collectMessageFiles,
  conversationOutcome,
  conversationPagePath,
  describeConversationOutcome,
  extractForbiddenWording,
  formatFileSize,
  formatFirstVisibleReplyLine,
  formatWordingList,
  isSuccessOutcome,
  leadNotificationHref,
  requestDocumentHref
} from "../../app/lib/conversation-vocabulary";
import {
  DOCUMENT_REQUEST_LABEL_MAX as SHARED_LABEL_MAX,
  DOCUMENT_REQUEST_MAX_OPEN as SHARED_MAX_OPEN,
  DOCUMENT_REQUEST_NOTE_MAX as SHARED_NOTE_MAX,
  LEAD_MESSAGE_ATTACHMENTS_MAX as SHARED_ATTACHMENTS_MAX,
  LEAD_MESSAGE_ATTACHMENT_MAX_BYTES as SHARED_ATTACHMENT_BYTES,
  LEAD_MESSAGE_ATTACHMENT_MIME_TYPES as SHARED_MIME_TYPES,
  LEAD_MESSAGE_BODY_MAX as SHARED_BODY_MAX,
  LEAD_CONVERSATION_READ_ONLY_REASONS
} from "../../../../packages/shared/contracts/lead-messaging";
import { CONVERSATION_READ_ONLY_LABELS } from "../../app/lib/conversation-vocabulary";
import { dashboardKpis } from "../../app/lib/ui/broker-view-models";

const read = (path: string) => readFileSync(path, "utf8");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const LEAD = "11111111-2222-4333-8444-555555555555";

const STARTER = "apps/broker/app/leads/[leadAssignmentId]";
const CRM = "apps/broker/app/crm/leads/[leadAssignmentId]";

test("the vocabulary constants mirror the shared messaging contract", async () => {
  expect(LEAD_MESSAGE_BODY_MAX).toBe(SHARED_BODY_MAX);
  expect(LEAD_MESSAGE_ATTACHMENTS_MAX).toBe(SHARED_ATTACHMENTS_MAX);
  expect(LEAD_MESSAGE_ATTACHMENT_MAX_BYTES).toBe(SHARED_ATTACHMENT_BYTES);
  expect([...LEAD_MESSAGE_ATTACHMENT_MIME_TYPES]).toEqual([...SHARED_MIME_TYPES]);
  expect(DOCUMENT_REQUEST_LABEL_MAX).toBe(SHARED_LABEL_MAX);
  expect(DOCUMENT_REQUEST_NOTE_MAX).toBe(SHARED_NOTE_MAX);
  expect(DOCUMENT_REQUEST_MAX_OPEN).toBe(SHARED_MAX_OPEN);
  // Every read-only reason of the contract has a French banner.
  for (const reason of LEAD_CONVERSATION_READ_ONLY_REASONS) expect(CONVERSATION_READ_ONLY_LABELS[reason], reason).toBeTruthy();
});

test("Starter lead page mounts the conversation next to the proposals and gains nothing of the CRM", async () => {
  const page = read(`${STARTER}/page.tsx`);
  expect(page).toContain('<LeadConversationSection channel="starter"');
  expect(page).toContain("conv?: string");
  expect(page).toContain("ProposalPanel");
  for (const crmOnly of ["tab=conversation", "changeCrmLeadStatusAction", "addCrmLeadTaskAction", "addCrmLeadReminderAction", "assignCrmAdvisorAction", "/crm/"]) {
    expect(page, crmOnly).not.toContain(crmOnly);
  }
  const panel = read("apps/broker/app/lib/ui/conversation-panel.tsx");
  expect(panel).toContain('<div id="conversation">');
  expect(panel).toContain("Échanger avec le visiteur");
});

test("CRM lead page gets a Conversation tab and keeps the others", async () => {
  const page = read(`${CRM}/page.tsx`);
  expect(page).toContain('{ key: "conversation", label: "Conversation" }');
  expect(page).toContain('{ key: "propositions", label: "Propositions" }');
  expect(page).toContain('currentTab === "conversation"');
  expect(page).toContain('<LeadConversationSection channel="crm"');
});

test("both route handler trees relay the conversation and the document requests with the session kept server-side", async () => {
  const relay = read("apps/broker/app/lib/conversation-relay.ts");
  expect(relay).toContain("/broker/${channel}/leads/${leadAssignmentId}");
  expect(relay).toContain("/conversation/messages");
  expect(relay).toContain("/conversation/read");
  expect(relay).toContain("/document-requests");
  expect(relay).toContain("/document-requests/${requestId}/cancel");
  expect(relay).toContain("/document-requests/${requestId}/documents/${documentId}/file");
  expect(relay).toContain("/conversation/messages/${messageId}/attachments/${attachmentId}");
  expect(relay).toContain("UUID.test");
  expect(relay).toContain("isSameOrigin(request)");
  expect(relay).toContain("forwardBrokerMultipart");
  expect(relay).toContain("forwardBrokerJson");
  expect(relay).toContain("relayBrokerFile");
  // Visitor-provided files: content-type allowlist, forced attachment with a sanitised name, sandbox.
  expect(relay.match(/visitorProvided: true/g)).toHaveLength(2);
  const upload = read("apps/broker/app/lib/broker-upload.ts");
  expect(upload).toContain('VISITOR_FILE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"]');
  expect(upload).toContain('"content-security-policy": "sandbox"');
  expect(upload).toContain("attachment; filename=");
  expect(upload).toContain('"x-content-type-options": "nosniff"');
  expect(upload).toContain("sameOriginPath(location)");
  // Token handling stays in broker-upload.ts / broker-write.ts (httpOnly cookie, server side).
  expect(relay).not.toContain("Authorization");
  expect(relay).not.toContain("use client");

  for (const [tree, channel] of [[STARTER, "starter"], [CRM, "crm"]] as const) {
    const messages = read(`${tree}/conversation/messages/route.ts`);
    expect(messages, tree).toContain(`relayConversationMessage(request, "${channel}", leadAssignmentId)`);
    expect(messages, tree).toContain(`/broker/${channel}/leads/:leadId/conversation/messages`);
    expect(messages, tree).toContain("export async function POST");
    const attachment = read(`${tree}/conversation/messages/[messageId]/attachments/[attachmentId]/route.ts`);
    expect(attachment, tree).toContain(`relayConversationAttachment("${channel}", leadAssignmentId, messageId, attachmentId)`);
    expect(attachment, tree).toContain("export async function GET");
    const requests = read(`${tree}/document-requests/route.ts`);
    expect(requests, tree).toContain(`relayDocumentRequestCreate(request, "${channel}", leadAssignmentId)`);
    expect(requests, tree).toContain(`/broker/${channel}/leads/:leadId/document-requests`);
    const file = read(`${tree}/document-requests/[requestId]/documents/[documentId]/file/route.ts`);
    expect(file, tree).toContain(`relayRequestDocument("${channel}", leadAssignmentId, requestId, documentId)`);
    for (const source of [messages, attachment, requests, file]) {
      expect(source, tree).not.toContain("getBackOfficeToken");
      expect(source, tree).not.toContain("Authorization");
    }
  }
  // Starter tree never targets the CRM API and vice versa.
  for (const file of ["conversation/messages/route.ts", "document-requests/route.ts"]) {
    expect(read(`${STARTER}/${file}`)).not.toContain('"crm"');
    expect(read(`${CRM}/${file}`)).not.toContain('"starter"');
  }
});

test("the panel is server-rendered, write-guarded, and only the composer is a client island", async () => {
  const panel = read("apps/broker/app/lib/ui/conversation-panel.tsx");
  const island = read("apps/broker/app/lib/ui/conversation-form.tsx");
  expect(panel).not.toContain("use client");
  expect(panel).toContain("TenantWriteGuard");
  expect(panel).toContain("ConversationForm");
  expect(panel).toContain('accept={LEAD_MESSAGE_ATTACHMENT_MIME_TYPES.join(",")}');
  expect(panel).toContain("multiple");
  expect(panel).toContain("maxLength={LEAD_MESSAGE_BODY_MAX}");
  expect(panel).toContain('"Vous" : "Visiteur"');
  expect(panel).toContain("Lu le");
  expect(panel).toContain("formAction={cancelDocumentRequestAction}");
  expect(panel).toContain("markConversationRead");
  expect(panel).toContain("readLeadConversation(channel, leadAssignmentId)");
  expect(panel).toContain("readLeadDocumentRequests(channel, leadAssignmentId)");
  expect(panel).toContain("conversation.notice");
  // The tenant guard only labels a suspended partner; another read-only reason shows its banner and no form.
  expect(panel).toContain("<TenantWriteGuard readOnly={tenantReadOnly}>");
  expect(panel).not.toContain("readOnly={tenantReadOnly || ");
  expect(panel).toContain("!conversation.canSend");

  // The island keeps the draft: fields stay uncontrolled, the reset happens on success only.
  expect(island.startsWith('"use client"')).toBe(true);
  expect(island).toContain('accept: "application/json"');
  expect(island).toContain("preventDefault");
  expect(island).toContain('value.includes("\\\\")');
  expect(island).toContain("window.location.origin");
  expect(island).toContain("new FormData(form)");
  expect(island).toContain("form.reset()");
  expect(island.indexOf("isSuccessOutcome(outcome)")).toBeLessThan(island.indexOf("form.reset()"));
  expect(island).toContain("router.refresh()");
  expect(island).toContain("formatWordingList(described.wording)");
  expect(island).not.toContain("useState(\"\")");
  expect(island).not.toContain("localStorage");
  expect(island).not.toContain("sessionStorage");
  expect(island).not.toContain("Authorization");
  expect(island).not.toContain("backoffice-auth");
  // Works without JavaScript too.
  expect(island).toContain('encType="multipart/form-data"');
  expect(island).toContain('method="post"');
});

test("new broker-facing wording is accented and promise-free", async () => {
  for (const path of [
    "apps/broker/app/lib/conversation-vocabulary.ts",
    "apps/broker/app/lib/ui/conversation-panel.tsx",
    "apps/broker/app/lib/ui/conversation-form.tsx"
  ]) {
    const source = read(path);
    for (const forbidden of ["acheter", "souscrire maintenant", "contrat valide", "garantie acceptée", "Echange", "Reponse"]) {
      expect(source, `${path}: ${forbidden}`).not.toContain(forbidden);
    }
  }
  expect(CONVERSATION_NOTICES.sent!.message).toContain("Message envoyé");
  expect(CONVERSATION_NOTICES.forbidden_wording!.message).toContain("formulation interdite");
});

test("API answers map to outcomes, including every refusal of the contract", async () => {
  expect(conversationOutcome({ status: 201 }, "sent")).toBe("sent");
  expect(conversationOutcome({ status: 201 }, "request_created")).toBe("request_created");
  const codes: Array<[number, string, string]> = [
    [409, "LEAD_NOT_ACCEPTED", "not_accepted"],
    [409, "LEAD_CLOSED", "lead_closed"],
    [409, "CONVERSATION_READ_ONLY", "read_only"],
    [409, "MESSAGING_DISABLED", "messaging_disabled"],
    [403, "MESSAGING_DISABLED", "messaging_disabled"],
    [409, "THREAD_LIMIT_REACHED", "thread_limit"],
    [409, "DUPLICATE_MESSAGE", "duplicate"],
    [422, "LEAD_CONSENT_WITHDRAWN", "consent_withdrawn"],
    [422, "FORBIDDEN_WORDING", "forbidden_wording"],
    [422, "DOCUMENT_QUARANTINED", "quarantined"],
    [422, "DOCUMENT_INVALID", "document_invalid"],
    [403, "PARTNER_SUSPENDED", "suspended"],
    [409, "DOCUMENT_REQUEST_LIMIT_REACHED", "request_limit"],
    [409, "DOCUMENT_REQUEST_NOT_OPEN", "request_not_open"]
  ];
  for (const [status, code, outcome] of codes) {
    expect(conversationOutcome({ status, code }, "sent"), code).toBe(outcome);
    expect(CONVERSATION_NOTICES[outcome], outcome).toBeTruthy();
  }
  expect(conversationOutcome({ status: 429 }, "sent")).toBe("rate_limited");
  expect(conversationOutcome({ status: 403 }, "sent")).toBe("forbidden");
  expect(conversationOutcome({ status: 404 }, "sent")).toBe("not_found");
  expect(conversationOutcome({ status: 400 }, "sent")).toBe("invalid");
  expect(conversationOutcome({ status: 500 }, "sent")).toBe("error");
  expect(conversationOutcome({ status: 0 }, "sent")).toBe("error");
  expect(isSuccessOutcome("sent")).toBe(true);
  expect(isSuccessOutcome("request_cancelled")).toBe(true);
  expect(isSuccessOutcome("forbidden_wording")).toBe(false);
});

test("a FORBIDDEN_WORDING refusal shows the offending expression(s)", async () => {
  expect(extractForbiddenWording({ code: "FORBIDDEN_WORDING", message: "x", details: { wording: ["garanti", " contrat valide "] } })).toEqual(["garanti", "contrat valide"]);
  expect(extractForbiddenWording({ wording: ["achetez maintenant"] })).toEqual(["achetez maintenant"]);
  expect(extractForbiddenWording({ code: "FORBIDDEN_WORDING", message: "Message refused: forbidden regulated wording (garanti, contrat valide)" })).toEqual(["garanti", "contrat valide"]);
  expect(extractForbiddenWording({ message: "Message refused: forbidden regulated wording (garantie acceptée)." })).toEqual(["garantie acceptée"]);
  expect(extractForbiddenWording({ message: "Refused" })).toEqual([]);
  expect(extractForbiddenWording(undefined)).toEqual([]);
  expect(extractForbiddenWording("garanti")).toEqual([]);
  expect(extractForbiddenWording({ details: { wording: ["x".repeat(500), 42, ""] }, message: "plain" })).toEqual([]);
  expect(extractForbiddenWording({ details: { wording: Array.from({ length: 30 }, (_, index) => `w${index}`) } })).toHaveLength(10);

  const described = describeConversationOutcome("forbidden_wording", ["garanti", "contrat valide"]);
  expect(described?.tone).toBe("warning");
  expect(described?.wording).toEqual(["garanti", "contrat valide"]);
  expect(formatWordingList(described?.wording ?? [])).toBe("« garanti », « contrat valide »");
  // The expression is only carried by the wording outcome.
  expect(describeConversationOutcome("sent", ["garanti"])?.wording).toEqual([]);
  expect(describeConversationOutcome("unknown")).toBeUndefined();
  // No-JavaScript fallback: only the outcome KEY travels in the URL, never the refused expressions.
  expect(conversationPagePath("starter", LEAD, "forbidden_wording")).toBe(`/leads/${LEAD}?conv=forbidden_wording#conversation`);
  expect(conversationPagePath("crm", LEAD, "sent")).toBe(`/crm/leads/${LEAD}?tab=conversation&conv=sent`);
  expect(conversationPagePath("crm", LEAD)).toBe(`/crm/leads/${LEAD}?tab=conversation`);
  expect(conversationPagePath("starter", LEAD)).toBe(`/leads/${LEAD}#conversation`);
  expect(conversationPagePath("starter", LEAD, "forbidden_wording")).not.toContain("convw");
  const relaySource = read("apps/broker/app/lib/conversation-relay.ts");
  const panelSource = read("apps/broker/app/lib/ui/conversation-panel.tsx");
  for (const source of [relaySource, panelSource, read("apps/broker/app/leads/[leadAssignmentId]/page.tsx"), read("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx")]) {
    expect(source).not.toContain("convw");
    expect(source).not.toContain("noticeWording");
  }
});

test("the relay builds the message payload without truncating the text and drops a bad idempotency key", async () => {
  expect(buildMessagePayload(form({ body: "  Bonjour, merci de votre demande.  ", clientRequestId: "req-1234-abcd" }))).toEqual({ ok: true, payload: { body: "Bonjour, merci de votre demande.", clientRequestId: "req-1234-abcd" } });
  expect(buildMessagePayload(form({ body: "Bonjour", clientRequestId: "bad id!" }))).toEqual({ ok: true, payload: { body: "Bonjour" } });
  expect(buildMessagePayload(form({ body: "   " })).ok).toBe(false);
  expect(buildMessagePayload(form({})).ok).toBe(false);
  expect(buildMessagePayload(form({ body: "a".repeat(LEAD_MESSAGE_BODY_MAX) })).ok).toBe(true);
  expect(buildMessagePayload(form({ body: "a".repeat(LEAD_MESSAGE_BODY_MAX + 1) }))).toEqual({ ok: false, outcome: "invalid" });
});

test("attachments are checked before the relay: 3 files, PDF/JPEG/PNG, 5 Mo", async () => {
  const withFiles = (...files: File[]) => {
    const data = new FormData();
    for (const file of files) data.append("files", file);
    return data;
  };
  const pdf = new File(["%PDF"], "devis.pdf", { type: "application/pdf" });
  expect(collectMessageFiles(withFiles(pdf, new File(["x"], "a.png", { type: "image/png" }), new File(["x"], "b.jpg", { type: "image/jpeg" })))).toMatchObject({ ok: true });
  expect(collectMessageFiles(withFiles())).toEqual({ ok: true, files: [] });
  // An empty file input posts a zero-byte entry: ignored.
  expect(collectMessageFiles(withFiles(new File([], "", { type: "application/octet-stream" })))).toEqual({ ok: true, files: [] });
  expect(collectMessageFiles(withFiles(pdf, pdf, pdf, pdf))).toEqual({ ok: false, outcome: "document_invalid" });
  expect(collectMessageFiles(withFiles(new File(["x"], "a.exe", { type: "application/x-msdownload" })))).toEqual({ ok: false, outcome: "document_invalid" });
  expect(collectMessageFiles(withFiles(new File([new Uint8Array(LEAD_MESSAGE_ATTACHMENT_MAX_BYTES + 1)], "gros.pdf", { type: "application/pdf" })))).toEqual({ ok: false, outcome: "document_invalid" });
  expect(formatFileSize(512)).toBe("512 o");
  expect(formatFileSize(2048)).toBe("2 Ko");
  expect(formatFileSize(5 * 1024 * 1024)).toBe("5,0 Mo");
});

test("the document request payload is validated before it reaches the API", async () => {
  const now = new Date("2026-10-15T10:00:00.000Z");
  expect(buildDocumentRequestPayload(form({ label: " Carte grise ", note: "Recto verso", dueAt: "2026-10-30" }), now)).toEqual({
    ok: true,
    payload: { label: "Carte grise", note: "Recto verso", dueAt: "2026-10-30T23:59:59.000Z" }
  });
  expect(buildDocumentRequestPayload(form({ label: "Carte grise" }), now)).toEqual({ ok: true, payload: { label: "Carte grise" } });
  expect(buildDocumentRequestPayload(form({ label: "" }), now).ok).toBe(false);
  expect(buildDocumentRequestPayload(form({ label: "a".repeat(DOCUMENT_REQUEST_LABEL_MAX + 1) }), now).ok).toBe(false);
  expect(buildDocumentRequestPayload(form({ label: "ok", note: "a".repeat(DOCUMENT_REQUEST_NOTE_MAX + 1) }), now).ok).toBe(false);
  expect(buildDocumentRequestPayload(form({ label: "ok", dueAt: "2026-10-01" }), now).ok).toBe(false);
  expect(buildDocumentRequestPayload(form({ label: "ok", dueAt: "demain" }), now).ok).toBe(false);
});

test("downloads go through the same-origin relay of the right channel", async () => {
  const message = "22222222-2222-4333-8444-555555555555";
  const attachment = "33333333-2222-4333-8444-555555555555";
  expect(attachmentHref("starter", LEAD, message, attachment)).toBe(`/leads/${LEAD}/conversation/messages/${message}/attachments/${attachment}`);
  expect(attachmentHref("crm", LEAD, message, attachment)).toBe(`/crm/leads/${LEAD}/conversation/messages/${message}/attachments/${attachment}`);
  expect(requestDocumentHref("starter", LEAD, message, attachment)).toBe(`/leads/${LEAD}/document-requests/${message}/documents/${attachment}/file`);
  expect(requestDocumentHref("crm", LEAD, message, attachment)).toBe(`/crm/leads/${LEAD}/document-requests/${message}/documents/${attachment}/file`);
});

test("notifications of the conversation open the right portal and keep the former link for the others", async () => {
  expect(leadNotificationHref("broker_visitor_message", LEAD, true)).toBe(`/leads/${LEAD}#conversation`);
  expect(leadNotificationHref("broker_document_received", LEAD, true)).toBe(`/leads/${LEAD}#conversation`);
  expect(leadNotificationHref("broker_visitor_message", LEAD, false)).toBe(`/crm/leads/${LEAD}?tab=conversation`);
  expect(leadNotificationHref("broker_document_received", LEAD, false)).toBe(`/crm/leads/${LEAD}?tab=conversation`);
  expect(leadNotificationHref("lead_assigned", LEAD, false)).toBe(`/crm/leads/${LEAD}`);
  expect(leadNotificationHref("lead_assigned", LEAD, true)).toBe(`/crm/leads/${LEAD}`);
  // A target that is not a UUID never builds a lead link.
  expect(leadNotificationHref("broker_visitor_message", "../../admin?x=1", true)).toBe("/notifications");
  expect(leadNotificationHref("lead_assigned", "not-a-uuid", false)).toBe("/notifications");
  expect(MESSAGING_NOTIFICATION_TYPE_LABELS.broker_visitor_message).toBe("Message du visiteur");
  expect(MESSAGING_NOTIFICATION_TYPE_LABELS.broker_document_received).toBe("Document reçu");
  const page = read("apps/broker/app/notifications/page.tsx");
  expect(page).toContain("leadNotificationHref(notification.type, notification.targetId, isStarterCrmDenied(session.profile))");
  expect(page).toContain("MESSAGING_NOTIFICATION_TYPE_LABELS");
});

test("the Enterprise SLA shows the first reply visible by the visitor only when the API sends it", async () => {
  expect(formatFirstVisibleReplyLine({})).toBeUndefined();
  expect(formatFirstVisibleReplyLine({ firstVisibleReplyMeasured: undefined })).toBeUndefined();
  expect(
    formatFirstVisibleReplyLine({ averageFirstVisibleReplyMinutes: 42.4, firstVisibleReplyMeasured: 7, firstVisibleReplyWithinTarget: 6, firstVisibleReplyComplianceRate: 0.857 })
  ).toBe("Première réponse visible par le visiteur : moyenne 42 min, 7 lead(s) mesuré(s), taux dans la cible 86 %");
  expect(formatFirstVisibleReplyLine({ averageFirstVisibleReplyMinutes: null, firstVisibleReplyMeasured: 0, firstVisibleReplyComplianceRate: null })).toBe(
    "Première réponse visible par le visiteur : moyenne —, 0 lead(s) mesuré(s), taux dans la cible —"
  );
  const page = read("apps/broker/app/enterprise/page.tsx");
  expect(page).toContain("formatFirstVisibleReplyLine(sla.data)");
  const api = read("apps/broker/app/lib/broker-api.ts");
  for (const field of ["averageFirstVisibleReplyMinutes", "firstVisibleReplyMeasured", "firstVisibleReplyWithinTarget", "firstVisibleReplyComplianceRate"]) expect(api).toContain(field);
});

test("the readers call the contract routes with safe fallbacks", async () => {
  const api = read("apps/broker/app/lib/broker-api.ts");
  expect(api).toContain("/broker/${channel}/leads/${encodeURIComponent(leadAssignmentId)}/conversation`");
  expect(api).toContain("/broker/${channel}/leads/${encodeURIComponent(leadAssignmentId)}/document-requests`");
  expect(api).toContain("export function readLeadConversation(");
  expect(api).toContain("export function readLeadDocumentRequests(");
  const actions = read("apps/broker/app/lib/conversation-actions.ts");
  expect(actions.startsWith('"use server"')).toBe(true);
  expect(actions).toContain("cancelDocumentRequest(channel, leadId, requestId)");
  expect(actions).toContain("UUID.test(leadId)");
});

test("the dashboard adds the first-visible-reply KPI only when the API sends the measure", async () => {
  const base = { received: 1, accepted: 1, rejected: 0, disputed: 0, pendingAction: 0, averageFirstActionMinutes: null, byProduct: [], byCountry: [] };
  const data = (starter: object) => ({ plan: "starter" as const, window: { from: "", to: "" }, starter: { ...base, ...starter }, licenseAlerts: [] });
  expect(dashboardKpis(data({}))).toHaveLength(5);
  const kpis = dashboardKpis(data({ averageFirstVisibleReplyMinutes: 18.2, firstVisibleReplyMeasured: 4 }));
  expect(kpis).toHaveLength(6);
  expect(kpis[5]).toMatchObject({ label: "Première réponse visible", value: "18 min", helper: "4 lead(s) mesuré(s)" });
});
