/**
 * Spec 062: vocabulary and pure helpers of the broker <-> visitor conversation, shared by the
 * Starter and CRM lead pages, their route-handler relays and the client composer island.
 *
 * Plain module on purpose: no `next/*` import, no server action, no token. It is importable from
 * server components, route handlers and the `"use client"` form island alike. The constants mirror
 * `packages/shared/contracts/lead-messaging.ts` (the Next app does not load runtime modules outside
 * its own directory); `tests/leads/broker-visitor-messaging.spec.ts` compares the two.
 */

export const LEAD_MESSAGE_BODY_MAX = 2000;
export const LEAD_MESSAGE_ATTACHMENTS_MAX = 3;
export const LEAD_MESSAGE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAD_MESSAGE_ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const LEAD_MESSAGE_CLIENT_REQUEST_ID_MAX = 64;
export const DOCUMENT_REQUEST_LABEL_MAX = 120;
export const DOCUMENT_REQUEST_NOTE_MAX = 500;
export const DOCUMENT_REQUEST_MAX_OPEN = 10;

export type ConversationChannel = "starter" | "crm";

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

/** Why a conversation (or a document request form) is read-only, mapped from `readOnlyReason` / `blockers`. */
export const CONVERSATION_READ_ONLY_LABELS: Record<string, string> = {
  not_accepted: "Acceptez d'abord le lead pour pouvoir échanger avec le visiteur.",
  lead_closed: "Ce lead est clôturé : la conversation est en lecture seule.",
  consent_withdrawn: "Le visiteur a retiré son consentement : la conversation est en lecture seule et aucun message ne peut être envoyé.",
  reassigned: "Ce lead a été réaffecté : la conversation est en lecture seule.",
  messaging_disabled: "La messagerie avec les visiteurs est temporairement désactivée par AssurMatch : la conversation est en lecture seule.",
  partner_suspended: "Compte suspendu : consultation seule. Contactez AssurMatch.",
  limit_reached: "10 demandes de documents ouvertes au maximum : annulez-en une avant d'en créer une nouvelle."
};

export const DOCUMENT_REQUEST_STATUS_LABELS: Record<string, string> = {
  open: "Ouverte",
  fulfilled: "Reçue",
  cancelled: "Annulée"
};

export const DOCUMENT_REQUEST_STATUS_TONES: Record<string, "info" | "success" | "warning" | "neutral" | "disabled"> = {
  open: "info",
  fulfilled: "success",
  cancelled: "disabled"
};

/** French labels of the in-app notification types of spec 062 (contract: Notifications). */
export const MESSAGING_NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  broker_visitor_message: "Message du visiteur",
  broker_document_received: "Document reçu"
};

export type ConversationNoticeTone = "info" | "success" | "warning" | "danger";

/** Notices keyed by outcome (query parameter `conv=` and `outcome` of the JSON relay answer). */
export const CONVERSATION_NOTICES: Record<string, { tone: ConversationNoticeTone; message: string }> = {
  sent: { tone: "success", message: "Message envoyé. Le visiteur est prévenu par e-mail (sans le texte du message) et le voit dans son espace de suivi." },
  request_created: { tone: "success", message: "Demande de document créée. Le visiteur est prévenu par e-mail et peut téléverser ses fichiers dans son espace de suivi." },
  request_cancelled: { tone: "info", message: "Demande de document annulée. Le visiteur ne peut plus y répondre." },
  not_accepted: { tone: "warning", message: "Le lead doit être accepté avant tout échange avec le visiteur." },
  lead_closed: { tone: "warning", message: "Ce lead est clôturé : aucun message ni demande ne peut être envoyé." },
  read_only: { tone: "warning", message: "La conversation est en lecture seule : envoi refusé." },
  messaging_disabled: { tone: "warning", message: "La messagerie avec les visiteurs est temporairement désactivée par AssurMatch." },
  thread_limit: { tone: "warning", message: "Limite de messages atteinte pour cette conversation (300 messages)." },
  duplicate: { tone: "warning", message: "Message identique déjà envoyé il y a moins de 5 minutes : envoi ignoré." },
  consent_withdrawn: { tone: "warning", message: "Le consentement du visiteur n'est plus actif : envoi refusé." },
  request_limit: { tone: "warning", message: "Limite de 10 demandes de documents ouvertes atteinte pour ce lead." },
  request_not_open: { tone: "warning", message: "Cette demande de document n'est plus ouverte." },
  forbidden_wording: { tone: "warning", message: "Envoi refusé : le texte contient une formulation interdite. Reformulez puis renvoyez." },
  quarantined: { tone: "danger", message: "Envoi refusé : un fichier n'a pas passé l'antivirus. Il n'a pas été conservé." },
  document_invalid: { tone: "warning", message: "Fichier refusé : 3 fichiers au maximum, PDF, JPEG ou PNG de 5 Mo chacun." },
  invalid: { tone: "warning", message: "Saisie refusée : le message (2000 caractères au maximum) ou l'intitulé de la demande (120 caractères) est obligatoire." },
  rate_limited: { tone: "warning", message: "Trop d'envois en peu de temps. Patientez quelques instants avant de réessayer." },
  forbidden: { tone: "warning", message: "Action refusée par vos permissions, votre tenant ou votre MFA." },
  suspended: { tone: "warning", message: "Compte suspendu : consultation seule. Contactez AssurMatch." },
  not_found: { tone: "warning", message: "Conversation ou demande introuvable pour ce lead." },
  session_expired: { tone: "warning", message: "Votre session a expiré. Reconnectez-vous ; votre texte reste dans le formulaire tant que la page n'est pas rechargée." },
  error: { tone: "danger", message: "Envoi indisponible pour le moment. Rien n'a été envoyé ; votre texte est conservé." }
};

const SUCCESS_OUTCOMES = new Set(["sent", "request_created", "request_cancelled"]);

export function isSuccessOutcome(outcome: string): boolean {
  return SUCCESS_OUTCOMES.has(outcome);
}

/** Notice for an outcome plus the offending expression(s) when the wording guard refused the text. */
export function describeConversationOutcome(outcome: string, wording: readonly string[] = []): { tone: ConversationNoticeTone; message: string; wording: string[] } | undefined {
  const entry = CONVERSATION_NOTICES[outcome];
  if (!entry) return undefined;
  return { ...entry, wording: outcome === "forbidden_wording" ? [...wording] : [] };
}

/** « garanti », « prix ferme » : the expressions between French quotation marks, ready to display. */
export function formatWordingList(wording: readonly string[]): string {
  return wording.map((expression) => `« ${expression} »`).join(", ");
}

// ---------------------------------------------------------------------------------------------
// API outcome mapping
// ---------------------------------------------------------------------------------------------

const CODE_OUTCOMES: Record<string, string> = {
  LEAD_NOT_ACCEPTED: "not_accepted",
  LEAD_CLOSED: "lead_closed",
  CONVERSATION_READ_ONLY: "read_only",
  MESSAGING_DISABLED: "messaging_disabled",
  THREAD_LIMIT_REACHED: "thread_limit",
  DUPLICATE_MESSAGE: "duplicate",
  LEAD_CONSENT_WITHDRAWN: "consent_withdrawn",
  DOCUMENT_REQUEST_LIMIT_REACHED: "request_limit",
  DOCUMENT_REQUEST_NOT_OPEN: "request_not_open",
  FORBIDDEN_WORDING: "forbidden_wording",
  DOCUMENT_QUARANTINED: "quarantined",
  DOCUMENT_INVALID: "document_invalid",
  DOCUMENT_STORAGE_NOT_CONFIGURED: "document_invalid",
  PARTNER_SUSPENDED: "suspended",
  RATE_LIMITED: "rate_limited"
};

/** Translates an API answer into a key of `CONVERSATION_NOTICES`. */
export function conversationOutcome(result: { status: number; code?: string | undefined }, success: string): string {
  if (result.status === 200 || result.status === 201) return success;
  if (result.code && CODE_OUTCOMES[result.code]) return CODE_OUTCOMES[result.code]!;
  if (result.status === 429) return "rate_limited";
  if (result.status === 403) return "forbidden";
  if (result.status === 404) return "not_found";
  if (result.status === 400 || result.status === 413 || result.status === 422) return "invalid";
  return "error";
}

const MAX_WORDING_ITEMS = 10;
const MAX_WORDING_LENGTH = 80;

function cleanWording(values: readonly unknown[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= MAX_WORDING_LENGTH)
    .slice(0, MAX_WORDING_ITEMS);
}

/**
 * Extracts the offending expression(s) of a FORBIDDEN_WORDING refusal from the API error body:
 * `details.wording` (or a top-level `wording`) when present, otherwise the last parenthesised group
 * of the message ("... forbidden regulated wording (garanti, prix ferme)"). Never throws.
 */
export function extractForbiddenWording(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const details = record.details && typeof record.details === "object" ? (record.details as Record<string, unknown>) : undefined;
  for (const candidate of [details?.wording, record.wording]) {
    if (Array.isArray(candidate)) {
      const cleaned = cleanWording(candidate);
      if (cleaned.length > 0) return cleaned;
    }
  }
  const message = typeof record.message === "string" ? record.message : undefined;
  if (!message) return [];
  const match = /\(([^()]*)\)\s*\.?\s*$/.exec(message);
  return match?.[1] ? cleanWording(match[1].split(",")) : [];
}

// ---------------------------------------------------------------------------------------------
// Payload builders (the backend re-validates everything)
// ---------------------------------------------------------------------------------------------

export type ConversationPayloadResult = { ok: true; payload: Record<string, unknown> } | { ok: false; outcome: string };

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** `{ body, clientRequestId? }` from the composer. The text is never truncated silently. */
export function buildMessagePayload(form: FormData): ConversationPayloadResult {
  const body = text(form, "body");
  if (!body || body.length > LEAD_MESSAGE_BODY_MAX) return { ok: false, outcome: "invalid" };
  const clientRequestId = text(form, "clientRequestId");
  return { ok: true, payload: { body, ...(CLIENT_REQUEST_ID.test(clientRequestId) ? { clientRequestId } : {}) } };
}

/**
 * `{ label, note?, dueAt? }` of a document request. The optional due date is a day; it means the end
 * of that day and must not be in the past.
 */
export function buildDocumentRequestPayload(form: FormData, now: Date = new Date()): ConversationPayloadResult {
  const label = text(form, "label");
  const note = text(form, "note");
  const dueDate = text(form, "dueAt");
  if (!label || label.length > DOCUMENT_REQUEST_LABEL_MAX || note.length > DOCUMENT_REQUEST_NOTE_MAX) return { ok: false, outcome: "invalid" };
  let dueAt: string | undefined;
  if (dueDate) {
    const due = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? new Date(`${dueDate}T23:59:59.000Z`) : undefined;
    if (!due || Number.isNaN(due.getTime()) || due.getTime() <= now.getTime()) return { ok: false, outcome: "invalid" };
    dueAt = due.toISOString();
  }
  return { ok: true, payload: { label, ...(note ? { note } : {}), ...(dueAt ? { dueAt } : {}) } };
}

export type MessageFilesResult = { ok: true; files: File[] } | { ok: false; outcome: string };

/** Picks the non-empty `files` of the composer and refuses more than 3, a wrong type or more than 5 Mo each. */
export function collectMessageFiles(form: FormData): MessageFilesResult {
  const files = form.getAll("files").filter((entry): entry is File => typeof entry !== "string" && entry.size > 0);
  if (files.length > LEAD_MESSAGE_ATTACHMENTS_MAX) return { ok: false, outcome: "document_invalid" };
  for (const file of files) {
    if (file.size > LEAD_MESSAGE_ATTACHMENT_MAX_BYTES) return { ok: false, outcome: "document_invalid" };
    if (!(LEAD_MESSAGE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) return { ok: false, outcome: "document_invalid" };
  }
  return { ok: true, files };
}

/** "2026-10-15 14:32" (UTC), same convention as the notification inbox. */
export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

// ---------------------------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------------------------

/** Lead page of a channel: Starter has no CRM tree, the CRM conversation is a tab of the CRM page. */
export function conversationPagePath(channel: ConversationChannel, leadAssignmentId: string, outcome?: string): string {
  const params: string[] = [];
  if (channel === "crm") params.push("tab=conversation");
  if (outcome) params.push(`conv=${encodeURIComponent(outcome)}`);
  const base = channel === "crm" ? `/crm/leads/${leadAssignmentId}` : `/leads/${leadAssignmentId}`;
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return `${base}${query}${channel === "starter" ? "#conversation" : ""}`;
}

export function attachmentHref(channel: ConversationChannel, leadAssignmentId: string, messageId: string, attachmentId: string): string {
  const base = channel === "crm" ? `/crm/leads/${leadAssignmentId}` : `/leads/${leadAssignmentId}`;
  return `${base}/conversation/messages/${messageId}/attachments/${attachmentId}`;
}

export function requestDocumentHref(channel: ConversationChannel, leadAssignmentId: string, requestId: string, documentId: string): string {
  const base = channel === "crm" ? `/crm/leads/${leadAssignmentId}` : `/leads/${leadAssignmentId}`;
  return `${base}/document-requests/${requestId}/documents/${documentId}/file`;
}

const LEAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where an in-app notification leads. The visitor-message and document-received notifications
 * (`targetType = LeadAssignment`) open the conversation of the right portal: Starter brokers never
 * reach `/crm`. Every other lead notification keeps its former link.
 */
export function leadNotificationHref(type: string, targetId: string, starterPlan: boolean): string {
  // A target that is not a UUID never builds a lead link: the notifications page is the safe fallback.
  if (!LEAD_ID_PATTERN.test(targetId)) return "/notifications";
  const id = encodeURIComponent(targetId);
  if (type in MESSAGING_NOTIFICATION_TYPE_LABELS) return starterPlan ? `/leads/${id}#conversation` : `/crm/leads/${id}?tab=conversation`;
  return `/crm/leads/${id}`;
}

// ---------------------------------------------------------------------------------------------
// SLA (E-08): first reply visible by the visitor
// ---------------------------------------------------------------------------------------------

export interface FirstVisibleReplySla {
  averageFirstVisibleReplyMinutes?: number | null | undefined;
  firstVisibleReplyMeasured?: number | null | undefined;
  firstVisibleReplyWithinTarget?: number | null | undefined;
  firstVisibleReplyComplianceRate?: number | null | undefined;
}

/**
 * "Première réponse visible par le visiteur : moyenne X min, N lead(s) mesuré(s), taux dans la cible Y %".
 * Returns undefined while the API does not send the additive fields (nothing is invented).
 */
export function formatFirstVisibleReplyLine(sla: FirstVisibleReplySla): string | undefined {
  if (typeof sla.firstVisibleReplyMeasured !== "number") return undefined;
  const average = typeof sla.averageFirstVisibleReplyMinutes === "number" ? `${Math.round(sla.averageFirstVisibleReplyMinutes)} min` : "—";
  const rate = typeof sla.firstVisibleReplyComplianceRate === "number" ? `${Math.round(sla.firstVisibleReplyComplianceRate * 100)} %` : "—";
  return `Première réponse visible par le visiteur : moyenne ${average}, ${sla.firstVisibleReplyMeasured} lead(s) mesuré(s), taux dans la cible ${rate}`;
}
