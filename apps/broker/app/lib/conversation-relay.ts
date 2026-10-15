import { loginRedirect } from "./backoffice-auth";
import { callBrokerWrite } from "./broker-write";
import { UUID, forwardBrokerJson, forwardBrokerMultipart, isSameOrigin, relayBrokerFile, seeOther } from "./broker-upload";
import type { BrokerRelayResult } from "./broker-upload";
import {
  buildDocumentRequestPayload,
  buildMessagePayload,
  collectMessageFiles,
  conversationOutcome,
  conversationPagePath,
  isSuccessOutcome
} from "./conversation-vocabulary";
import type { ConversationChannel } from "./conversation-vocabulary";

/**
 * Spec 062: server-side relays of the broker conversation (message + attachments, document request)
 * and of the file downloads, shared by the Starter (`/leads/...`) and CRM (`/crm/leads/...`) route
 * handler trees. The session token is read from the httpOnly cookie in `broker-upload.ts` and never
 * reaches the browser; the API re-checks tenant, role, plan, suspension, wording guard and antivirus.
 *
 * Two answer modes, one handler:
 * - `Accept: application/json` (the draft-preserving composer island): a JSON body
 *   `{ ok, outcome, wording? }`, so the typed text is never lost on a refusal;
 * - otherwise (no JavaScript): a 303 back to the page with `?conv=<outcome>`.
 */
export const CONVERSATION_RELAY_SOURCE_MARKER = "conversation-relay:062";

function apiBase(channel: ConversationChannel, leadAssignmentId: string): string {
  return `/broker/${channel}/leads/${leadAssignmentId}`;
}

function leadListPath(channel: ConversationChannel): string {
  return channel === "crm" ? "/crm/leads" : "/leads";
}

function wantsJson(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("application/json");
}

function jsonAnswer(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Answers an outcome known before any API call (invalid input). */
function answerOutcome(request: Request, channel: ConversationChannel, leadAssignmentId: string, outcome: string): Response {
  if (wantsJson(request)) return jsonAnswer({ ok: false, outcome });
  return seeOther(request, conversationPagePath(channel, leadAssignmentId, outcome));
}

/** Answers the API result: login redirect on 401, the mapped outcome otherwise. */
function answerResult(request: Request, channel: ConversationChannel, leadAssignmentId: string, result: BrokerRelayResult, success: string): Response {
  if (result.status === 401) {
    const location = loginRedirect(conversationPagePath(channel, leadAssignmentId), "session_expired");
    return wantsJson(request) ? jsonAnswer({ ok: false, outcome: "session_expired", location }) : seeOther(request, location);
  }
  const outcome = conversationOutcome(result, success);
  const wording = result.wording ?? [];
  if (wantsJson(request)) return jsonAnswer({ ok: isSuccessOutcome(outcome), outcome, ...(wording.length > 0 ? { wording } : {}) });
  return seeOther(request, conversationPagePath(channel, leadAssignmentId, outcome, wording));
}

/** POST /broker/{starter|crm}/leads/:leadId/conversation/messages (JSON `payload` + up to 3 `files`). */
export async function relayConversationMessage(request: Request, channel: ConversationChannel, leadAssignmentId: string): Promise<Response> {
  if (!UUID.test(leadAssignmentId)) return seeOther(request, leadListPath(channel));
  if (!isSameOrigin(request)) return new Response("forbidden_origin", { status: 403 });
  const form = await request.formData().catch(() => undefined);
  if (!form) return answerOutcome(request, channel, leadAssignmentId, "invalid");
  const built = buildMessagePayload(form);
  if (!built.ok) return answerOutcome(request, channel, leadAssignmentId, built.outcome);
  const files = collectMessageFiles(form);
  if (!files.ok) return answerOutcome(request, channel, leadAssignmentId, files.outcome);
  const upstream = new FormData();
  upstream.append("payload", JSON.stringify(built.payload));
  for (const file of files.files) upstream.append("files", file, file.name);
  const result = await forwardBrokerMultipart(`${apiBase(channel, leadAssignmentId)}/conversation/messages`, upstream);
  return answerResult(request, channel, leadAssignmentId, result, "sent");
}

/** POST /broker/{starter|crm}/leads/:leadId/document-requests (`{ label, note?, dueAt? }`). */
export async function relayDocumentRequestCreate(request: Request, channel: ConversationChannel, leadAssignmentId: string): Promise<Response> {
  if (!UUID.test(leadAssignmentId)) return seeOther(request, leadListPath(channel));
  if (!isSameOrigin(request)) return new Response("forbidden_origin", { status: 403 });
  const form = await request.formData().catch(() => undefined);
  if (!form) return answerOutcome(request, channel, leadAssignmentId, "invalid");
  const built = buildDocumentRequestPayload(form);
  if (!built.ok) return answerOutcome(request, channel, leadAssignmentId, built.outcome);
  const result = await forwardBrokerJson(`${apiBase(channel, leadAssignmentId)}/document-requests`, built.payload);
  return answerResult(request, channel, leadAssignmentId, result, "request_created");
}

/** GET .../conversation/messages/:messageId/attachments/:attachmentId (audited by the API, no-store). */
export function relayConversationAttachment(channel: ConversationChannel, leadAssignmentId: string, messageId: string, attachmentId: string): Promise<Response> {
  if (![leadAssignmentId, messageId, attachmentId].every((id) => UUID.test(id))) return Promise.resolve(new Response("not_found", { status: 404 }));
  return relayBrokerFile(`${apiBase(channel, leadAssignmentId)}/conversation/messages/${messageId}/attachments/${attachmentId}`);
}

/** GET .../document-requests/:requestId/documents/:documentId/file (file provided by the visitor, audited). */
export function relayRequestDocument(channel: ConversationChannel, leadAssignmentId: string, requestId: string, documentId: string): Promise<Response> {
  if (![leadAssignmentId, requestId, documentId].every((id) => UUID.test(id))) return Promise.resolve(new Response("not_found", { status: 404 }));
  return relayBrokerFile(`${apiBase(channel, leadAssignmentId)}/document-requests/${requestId}/documents/${documentId}/file`);
}

/** POST .../document-requests/:requestId/cancel (used by the cancel server action). */
export function cancelDocumentRequest(channel: ConversationChannel, leadAssignmentId: string, requestId: string) {
  return callBrokerWrite(`${apiBase(channel, leadAssignmentId)}/document-requests/${requestId}/cancel`, "POST", {});
}

/** POST .../conversation/read - best effort: a refusal (read-only role, suspension) never breaks the page. */
export async function markConversationRead(channel: ConversationChannel, leadAssignmentId: string): Promise<void> {
  if (!UUID.test(leadAssignmentId)) return;
  try {
    await callBrokerWrite(`${apiBase(channel, leadAssignmentId)}/conversation/read`, "POST", {});
  } catch {
    // Reading the thread must never fail because the read receipt could not be recorded.
  }
}
