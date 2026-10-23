import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import {
  LEAD_MESSAGE_ATTACHMENTS_MAX,
  LEAD_MESSAGE_ATTACHMENT_MAX_BYTES,
  LEAD_MESSAGE_ATTACHMENT_MIME_TYPES,
  type LeadConversationReadOnlyReason
} from "../../../../packages/shared/contracts/lead-messaging";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import { storeScannedFile, type ScannedUploadDeps, type ScannedUploadRefusal, type StoredScannedFile, type UploadedLeadFile } from "../lead-proposals/scanned-upload";
import type { MessagingQuote } from "./lead-messaging.ports";

export const ACCEPTED_ASSIGNMENT = new Set(["accepted", "received", "contacted"]);
export const CLOSED_ASSIGNMENT = new Set(["closed", "rejected", "disputed"]);
export const CLOSED_CRM = new Set(["gagne", "perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"]);

export type LeadState = "accepted" | "not_accepted" | "closed";

/** Same reading of an assignment as the proposals (spec 055): closed beats accepted beats not accepted. */
export function leadState(assignment: LeadAssignmentRecord): LeadState {
  if (CLOSED_ASSIGNMENT.has(assignment.status)) return "closed";
  if (assignment.crmStatus && CLOSED_CRM.has(assignment.crmStatus)) return "closed";
  if (ACCEPTED_ASSIGNMENT.has(assignment.status)) return "accepted";
  if (assignment.crmStatus && assignment.crmStatus !== "nouveau") return "accepted";
  return "not_accepted";
}

export function consentWithdrawn(quote: MessagingQuote | undefined): boolean {
  return !quote || quote.status === "cancelled" || Boolean(quote.anonymizedAt);
}

export function quoteLocale(quote: MessagingQuote | undefined): "fr" | "en" {
  return quote?.language === "en" ? "en" : "fr";
}

/**
 * Opaque identifier of a conversation: a hash of (assignment, broker). A reassignment changes the
 * broker of the same assignment row, hence produces a distinct conversation; no tenant id leaks.
 */
export function conversationIdFor(leadAssignmentId: string, partnerTenantId: string): string {
  return createHash("sha256").update(`${leadAssignmentId}:${partnerTenantId}`).digest("hex").slice(0, 32);
}

/**
 * Why the current broker cannot write right now, in the order the messages are most specific:
 * a withdrawn consent first, then a closed lead, then a lead that was not accepted yet.
 */
export function brokerWriteBlocker(assignment: LeadAssignmentRecord, quote: MessagingQuote | undefined): "consent_withdrawn" | "lead_closed" | "not_accepted" | undefined {
  if (consentWithdrawn(quote)) return "consent_withdrawn";
  const state = leadState(assignment);
  if (state === "closed") return "lead_closed";
  if (state === "not_accepted") return "not_accepted";
  return undefined;
}

export function readOnlyMessage(reason: LeadConversationReadOnlyReason): string {
  switch (reason) {
    case "consent_withdrawn": return "Conversation is read-only: the visitor's consent is no longer active";
    case "lead_closed": return "Conversation is read-only: the lead is closed";
    case "reassigned": return "Conversation is read-only: the lead was reassigned to another broker";
    case "messaging_disabled": return "Messaging is switched off";
    case "partner_suspended": return "Conversation is read-only: the partner account is suspended";
    case "not_accepted": return "Conversation is read-only: the lead is not accepted";
  }
}

export function conflict(code: string, message: string, details?: Record<string, unknown>): ConflictException {
  return new ConflictException({ code, message, ...(details ? { details } : {}) });
}

export function unprocessable(code: string, message: string, details?: Record<string, unknown>): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, ...(details ? { details } : {}) });
}

export function badRequest(message: string): BadRequestException {
  return new BadRequestException({ code: ErrorCodes.VALIDATION_FAILED, message });
}

export function forbiddenWordingError(wording: readonly string[]): UnprocessableEntityException {
  return unprocessable(ErrorCodes.FORBIDDEN_WORDING, `Refused: forbidden regulated wording (${wording.join(", ")})`, { wording: [...wording] });
}

export type AttachmentStoreOutcome =
  | { ok: true; files: Array<{ stored: StoredScannedFile }> }
  | { ok: false; refusal: ScannedUploadRefusal | "too_many_files"; signature?: string | undefined; engine?: string | undefined };

/**
 * All-or-nothing storage of up to three scanned attachments: the first file that is not clean (or
 * not valid) deletes the ones already stored and refuses the whole send, so no partial message and
 * no orphan object is left behind.
 */
export async function storeAttachments(upload: ScannedUploadDeps, files: readonly UploadedLeadFile[], keyPrefix: string): Promise<AttachmentStoreOutcome> {
  if (files.length > LEAD_MESSAGE_ATTACHMENTS_MAX) return { ok: false, refusal: "too_many_files" };
  const stored: StoredScannedFile[] = [];
  for (const file of files) {
    const result = await storeScannedFile(upload, file, { allowedMimeTypes: LEAD_MESSAGE_ATTACHMENT_MIME_TYPES, maxBytes: LEAD_MESSAGE_ATTACHMENT_MAX_BYTES, keyPrefix });
    if (!result.ok) {
      await discardStored(upload, stored);
      return { ok: false, refusal: result.refusal, signature: result.signature, engine: result.engine };
    }
    stored.push(result.file);
  }
  return { ok: true, files: stored.map((file) => ({ stored: file })) };
}

export async function discardStored(upload: ScannedUploadDeps, stored: readonly StoredScannedFile[]): Promise<void> {
  for (const file of stored) await upload.storage.delete(file.storageKey).catch(() => undefined);
}

export function isQuarantine(refusal: ScannedUploadRefusal | "too_many_files"): boolean {
  return refusal === "infected" || refusal === "scan_failed";
}

/** HTTP error of an attachment refusal (never reveals the file name). */
export function attachmentRefusalError(refusal: ScannedUploadRefusal | "too_many_files"): Error {
  if (refusal === "too_many_files") return badRequest(`Invalid input: at most ${LEAD_MESSAGE_ATTACHMENTS_MAX} attachments`);
  if (isQuarantine(refusal)) return unprocessable(ErrorCodes.DOCUMENT_QUARANTINED, `Refused: the file did not pass the antivirus (${refusal})`);
  if (refusal === "storage_not_configured") return unprocessable(ErrorCodes.DOCUMENT_STORAGE_NOT_CONFIGURED, "Refused: document storage is not configured");
  return unprocessable(ErrorCodes.DOCUMENT_INVALID, `Refused: invalid document (${refusal})`);
}
