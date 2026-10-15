import { NotFoundException } from "@nestjs/common";
import { findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import {
  DOCUMENT_REQUEST_MAX_OPEN,
  DOCUMENT_REQUEST_UPLOAD_FILES_MAX,
  VISITOR_UPLOAD_RATE_LIMIT_PER_IP_PER_HOUR,
  type BrokerDocumentRequest,
  type BrokerDocumentRequestList,
  type DocumentRequestBlocker,
  type DocumentRequestCancelReason,
  type DocumentRequestCreate,
  type VisitorDocumentRequest,
  type VisitorDocumentRequestList,
  type VisitorDocumentUploadResult
} from "../../../../packages/shared/contracts/lead-messaging";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { LeadMessagingAuditActions } from "../audit-logs/lead-messaging-audit-actions";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { BrokerCrmAccessPolicy } from "../leads/broker-crm-access-policy";
import type { BrokerStarterAccessPolicy } from "../leads/broker-starter-access-policy";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { ProposalFile } from "../lead-proposals/lead-proposals.service";
import type { ScannedUploadDeps, StoredScannedFile, UploadedLeadFile } from "../lead-proposals/scanned-upload";
import { assertBrokerTenantWritable } from "../partners/partner-tenant-status.service";
import type { QuoteDocumentRecord } from "../quote-documents/quote-documents.repository";
import { visitorAccessDenied } from "../quote-requests/quote-submission.service";
import type { LeadMessagingChannel, VisitorRequestContext } from "./lead-messaging.service";
import { messageNotificationBucket, type LeadMessagingNotificationsPort, type MessagingQuote } from "./lead-messaging.ports";
import {
  MemoryLeadMessagingRepository,
  type LeadDocumentRequestRecord,
  type LeadMessagingRepository
} from "./lead-messaging.repository";
import {
  attachmentRefusalError,
  badRequest,
  brokerWriteBlocker,
  conflict,
  consentWithdrawn,
  discardStored,
  forbiddenWordingError,
  isQuarantine,
  leadState,
  storeAttachments,
  unprocessable
} from "./lead-messaging.rules";

/** What the service needs from `QuoteDocumentsService` (the existing visitor document store, spec 033). */
export interface RequestedDocumentsPort {
  acceptRequestedDocument(input: {
    quote: { id: string; prospectId?: string | null | undefined };
    assignment: LeadAssignmentRecord;
    documentRequestId: string;
    label: string;
    file: { storageKey: string; fileName: string; mimeType: string; sizeBytes: number; checksum: string; scanEngine: string; scannedAt: Date };
  }): Promise<QuoteDocumentRecord>;
  listForDocumentRequest(quoteRequestId: string, documentRequestId: string): Promise<QuoteDocumentRecord[]>;
  readRequestedDocument(quoteRequestId: string, documentRequestId: string, documentId: string): Promise<{ document: QuoteDocumentRecord; bytes: Buffer } | undefined>;
}

export interface DocumentRequestsServiceDeps {
  audit: AuditLogWriter;
  repository?: LeadMessagingRepository | undefined;
  assignments: LeadAssignmentService;
  crmAccess: BrokerCrmAccessPolicy;
  starterAccess: BrokerStarterAccessPolicy;
  /** Scan pipeline of the visitor uploads (synchronous antivirus, clean files only). */
  upload: ScannedUploadDeps;
  documents: RequestedDocumentsPort;
  quotes: { findById(id: string): Promise<(MessagingQuote & { prospectId?: string | null | undefined }) | undefined> };
  partnerName: (partnerTenantId: string) => Promise<string>;
  notifications?: LeadMessagingNotificationsPort | undefined;
  visitorAccess?: { verify(publicReference: string, token: string, actor?: ActorContext): Promise<{ quote: MessagingQuote & { prospectId?: string | null | undefined } } | undefined> } | undefined;
  abuseGuard?: PublicAbuseGuardService | undefined;
  redis?: RedisClientPort | undefined;
  isMessagingEnabled?: (() => boolean) | undefined;
  now?: () => Date;
}

const SYSTEM_VISITOR: ActorContext = { actorId: "visitor", roles: [] };
const WINDOW_SECONDS = 3600;

type Quote = MessagingQuote & { prospectId?: string | null | undefined };

/**
 * Spec 062 (E-05): documents the assigned broker asks the visitor for.
 *
 * - A request is `open` until the visitor provides a clean file (`fulfilled`) or it is cancelled by
 *   the broker, a reassignment or the closure of the lead (`cancelled`); nothing else changes it.
 * - The provided files are stored as visitor documents tied to the request (spec 033 store) and are
 *   shared with the current assignment; they never reach another broker.
 * - Closure of a previous broker's open requests is lazy (every read reconciles) and also available
 *   as `closeForAssignment` for the reassignment and closure paths.
 */
export class DocumentRequestsService {
  private readonly repository: LeadMessagingRepository;

  constructor(private readonly deps: DocumentRequestsServiceDeps) {
    this.repository = deps.repository ?? new MemoryLeadMessagingRepository();
  }

  // ---------------------------------------------------------------------------------------------
  // Broker side
  // ---------------------------------------------------------------------------------------------

  async listForBroker(channel: LeadMessagingChannel, leadId: string, actor: ActorContext): Promise<BrokerDocumentRequestList> {
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const quote = await this.quoteOf(assignment.quoteRequestId);
    const own = await this.currentRequests(assignment, quote);
    const items: BrokerDocumentRequest[] = [];
    for (const request of own) items.push(await this.toBroker(request));
    const openCount = own.filter((request) => request.status === "open").length;
    const blockers = this.createBlockers(assignment, quote, actor, openCount);
    return { items, openCount, maxOpen: DOCUMENT_REQUEST_MAX_OPEN, canCreate: blockers.length === 0, blockers };
  }

  async create(channel: LeadMessagingChannel, leadId: string, input: DocumentRequestCreate, actor: ActorContext): Promise<BrokerDocumentRequest> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.assertMutation(channel, actor, assignment);
    const refuse = (code: string, reason: string, error: Error, context: Record<string, unknown> = {}): never => {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.documentRequestRefused,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
        result: "refused",
        reason,
        context: { channel, code, ...context }
      });
      throw error;
    };
    if (!this.enabled()) refuse(ErrorCodes.MESSAGING_DISABLED, "messaging_disabled", conflict(ErrorCodes.MESSAGING_DISABLED, "Messaging is switched off"));
    const quote = await this.quoteOf(assignment.quoteRequestId);
    const blocker = brokerWriteBlocker(assignment, quote);
    if (blocker === "consent_withdrawn") refuse(ErrorCodes.LEAD_CONSENT_WITHDRAWN, blocker, unprocessable(ErrorCodes.LEAD_CONSENT_WITHDRAWN, "Request refused: the visitor's consent is no longer active"));
    if (blocker === "lead_closed") refuse(ErrorCodes.LEAD_CLOSED, blocker, conflict(ErrorCodes.LEAD_CLOSED, "Lead closed: no document can be requested"));
    if (blocker === "not_accepted") refuse(ErrorCodes.LEAD_NOT_ACCEPTED, blocker, conflict(ErrorCodes.LEAD_NOT_ACCEPTED, "Lead must be accepted before documents are requested"));
    const activeQuote = quote as Quote;

    const wording = findForbiddenWordingAnyLanguage([input.label, input.note ?? ""].join("\n"));
    if (wording.length > 0) refuse(ErrorCodes.FORBIDDEN_WORDING, "forbidden_wording", forbiddenWordingError(wording), { wordingCount: wording.length });
    const own = await this.currentRequests(assignment, quote);
    const openCount = own.filter((request) => request.status === "open").length;
    if (openCount >= DOCUMENT_REQUEST_MAX_OPEN) {
      refuse(ErrorCodes.DOCUMENT_REQUEST_LIMIT_REACHED, "open_limit_reached", conflict(ErrorCodes.DOCUMENT_REQUEST_LIMIT_REACHED, `At most ${DOCUMENT_REQUEST_MAX_OPEN} open document requests per lead`), { openCount });
    }

    const now = this.now();
    const request = await this.repository.createDocumentRequest({
      id: crypto.randomUUID(),
      quoteRequestId: assignment.quoteRequestId,
      leadAssignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      ...(actor.actorId ? { authorId: actor.actorId } : {}),
      label: input.label,
      ...(input.note ? { note: input.note } : {}),
      ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      status: "open",
      fulfilledDocumentCount: 0,
      createdAt: now,
      updatedAt: now
    });
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.documentRequestCreated,
      targetType: "LeadDocumentRequest",
      targetId: request.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId, leadAssignmentId: assignment.id },
      result: "success",
      context: { channel, hasNote: Boolean(request.note), hasDueDate: Boolean(request.dueAt) }
    });
    // One pointer e-mail per request (dedupe key on the request id); it does not repeat the label.
    await this.safely(() => this.deps.notifications?.queueVisitorDocumentsRequested(activeQuote, { assignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, requestId: request.id }, actor));
    return this.toBroker(request);
  }

  async cancel(channel: LeadMessagingChannel, leadId: string, requestId: string, actor: ActorContext): Promise<BrokerDocumentRequest> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.assertMutation(channel, actor, assignment);
    if (!this.enabled()) {
      this.refuseAudit(actor, assignment, "messaging_disabled", { channel });
      throw conflict(ErrorCodes.MESSAGING_DISABLED, "Messaging is switched off");
    }
    const quote = await this.quoteOf(assignment.quoteRequestId);
    await this.currentRequests(assignment, quote);
    const request = await this.ownRequest(assignment, requestId);
    if (request.status !== "open") {
      this.refuseAudit(actor, assignment, "request_not_open", { channel, status: request.status });
      throw conflict(ErrorCodes.DOCUMENT_REQUEST_NOT_OPEN, "Only an open document request can be cancelled");
    }
    const updated = await this.repository.transitionDocumentRequest(request.id, {
      status: "cancelled",
      cancelledAt: this.now(),
      ...(actor.actorId ? { cancelledById: actor.actorId } : {}),
      cancelReason: "broker"
    });
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.documentRequestCancelled,
      targetType: "LeadDocumentRequest",
      targetId: request.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId, leadAssignmentId: assignment.id },
      result: "success",
      context: { channel, reason: "broker" }
    });
    return this.toBroker(updated);
  }

  /** The file the visitor provided against one of the current broker's requests: clean only, audited. */
  async brokerDocument(channel: LeadMessagingChannel, leadId: string, requestId: string, documentId: string, actor: ActorContext): Promise<ProposalFile> {
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const refuse = (reason: string): never => {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.documentRequestDocumentDownloadRefused,
        targetType: "LeadDocumentRequest",
        targetId: requestId,
        scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
        result: "refused",
        reason,
        context: { by: "broker" }
      });
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Document not found" });
    };
    const request = await this.repository.findDocumentRequest(requestId);
    if (!request || request.leadAssignmentId !== assignment.id || request.partnerTenantId !== assignment.partnerTenantId) return refuse("request_not_found");
    const found = await this.deps.documents.readRequestedDocument(assignment.quoteRequestId, request.id, documentId);
    if (!found) return refuse("document_unavailable");
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.documentRequestDocumentDownloaded,
      targetType: "QuoteRequestDocument",
      targetId: found.document.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId, leadAssignmentId: assignment.id },
      result: "success",
      context: { by: "broker", requestId: request.id }
    });
    return { bytes: found.bytes, fileName: found.document.fileName, mimeType: found.document.mimeType };
  }

  // ---------------------------------------------------------------------------------------------
  // Visitor side (token of spec 054)
  // ---------------------------------------------------------------------------------------------

  async visitorList(publicReference: string, token: string, context: VisitorRequestContext = {}): Promise<VisitorDocumentRequestList> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const assignments = await this.quoteAssignments(quote.id);
    const items: VisitorDocumentRequest[] = [];
    for (const request of await this.repository.listDocumentRequestsForQuote(quote.id)) {
      const current = await this.reconcile(request, assignments.get(request.leadAssignmentId), quote);
      const openable = current.status === "open" && this.enabled();
      items.push({
        id: current.id,
        partnerName: await this.deps.partnerName(current.partnerTenantId),
        label: current.label,
        ...(current.note ? { note: current.note } : {}),
        ...(current.dueAt ? { dueAt: current.dueAt.toISOString() } : {}),
        status: current.status,
        createdAt: current.createdAt.toISOString(),
        ...(current.fulfilledAt ? { fulfilledAt: current.fulfilledAt.toISOString() } : {}),
        canUpload: openable,
        uploadedCount: current.fulfilledDocumentCount
      });
    }
    return { items: items.reverse() };
  }

  async visitorUpload(publicReference: string, token: string, requestId: string, files: readonly UploadedLeadFile[], context: VisitorRequestContext = {}): Promise<VisitorDocumentUploadResult> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({ scope: "document_request_upload", ipAddress: context.ipAddress, limitPerWindow: VISITOR_UPLOAD_RATE_LIMIT_PER_IP_PER_HOUR, windowSeconds: WINDOW_SECONDS });
    }
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const found = await this.repository.findDocumentRequest(requestId);
    // Another request's document request is indistinguishable from an unknown one.
    if (!found || found.quoteRequestId !== quote.id) throw visitorAccessDenied();
    const assignments = await this.quoteAssignments(quote.id);
    const request = await this.reconcile(found, assignments.get(found.leadAssignmentId), quote);
    const refuse = (code: string, reason: string, error: Error): never => {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.documentRequestRefused,
        targetType: "LeadDocumentRequest",
        targetId: request.id,
        scope: { quoteRequestId: quote.id, partnerTenantId: request.partnerTenantId },
        result: "refused",
        reason,
        context: { code, side: "visitor" }
      });
      throw error;
    };

    if (!this.enabled()) refuse(ErrorCodes.MESSAGING_DISABLED, "messaging_disabled", conflict(ErrorCodes.MESSAGING_DISABLED, "Messaging is switched off"));
    if (request.status !== "open") refuse(ErrorCodes.DOCUMENT_REQUEST_NOT_OPEN, `request_${request.status}`, conflict(ErrorCodes.DOCUMENT_REQUEST_NOT_OPEN, "This document request is no longer open"));
    if (files.length === 0) refuse(ErrorCodes.VALIDATION_FAILED, "file_missing", badRequest("Invalid input: at least one file is required"));
    if (files.length > DOCUMENT_REQUEST_UPLOAD_FILES_MAX) refuse(ErrorCodes.VALIDATION_FAILED, "too_many_files", badRequest(`Invalid input: at most ${DOCUMENT_REQUEST_UPLOAD_FILES_MAX} files`));
    const assignment = assignments.get(request.leadAssignmentId) as LeadAssignmentRecord;

    const stored = await storeAttachments(this.deps.upload, files, "dr");
    if (!stored.ok) {
      if (isQuarantine(stored.refusal)) {
        this.deps.audit.write({
          actor,
          action: LeadMessagingAuditActions.documentRequestUploadQuarantined,
          targetType: "LeadDocumentRequest",
          targetId: request.id,
          scope: { quoteRequestId: quote.id, partnerTenantId: request.partnerTenantId },
          result: stored.refusal === "infected" ? "success" : "failed",
          reason: stored.refusal,
          context: { verdict: stored.refusal, ...(stored.engine ? { engine: stored.engine } : {}) }
        });
      }
      // The request stays open: nothing was stored or referenced.
      return refuse(isQuarantine(stored.refusal) ? ErrorCodes.DOCUMENT_QUARANTINED : ErrorCodes.DOCUMENT_INVALID, `upload_${stored.refusal}`, attachmentRefusalError(stored.refusal));
    }

    const accepted: StoredScannedFile[] = stored.files.map((entry) => entry.stored);
    try {
      for (const file of accepted) {
        await this.deps.documents.acceptRequestedDocument({ quote, assignment, documentRequestId: request.id, label: request.label, file });
      }
    } catch (error) {
      await discardStored(this.deps.upload, accepted);
      throw error;
    }
    const now = this.now();
    try {
      await this.repository.transitionDocumentRequest(request.id, { status: "fulfilled", fulfilledAt: now, fulfilledDocumentCount: accepted.length });
    } catch {
      // A concurrent upload fulfilled it first: the files above are still attached and shared.
    }
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.documentRequestFulfilled,
      targetType: "LeadDocumentRequest",
      targetId: request.id,
      scope: { quoteRequestId: quote.id, partnerTenantId: request.partnerTenantId, leadAssignmentId: assignment.id },
      result: "success",
      context: { fileCount: accepted.length }
    });
    await this.safely(() => this.deps.notifications?.queueBrokerDocumentReceived(quote, { assignmentId: assignment.id, partnerTenantId: request.partnerTenantId, requestId: request.id, bucket: messageNotificationBucket(now) }, actor));
    return { requestId: request.id, status: "fulfilled", uploaded: accepted.length };
  }

  // ---------------------------------------------------------------------------------------------
  // Closure and retention
  // ---------------------------------------------------------------------------------------------

  /**
   * Cancels every open request of an assignment (reassignment or closure of the lead). Idempotent;
   * also reached lazily by every read, so a missed call never leaves a request open.
   */
  async closeForAssignment(leadAssignmentId: string, reason: Extract<DocumentRequestCancelReason, "reassigned" | "closed">, actor?: ActorContext): Promise<number> {
    let cancelled = 0;
    for (const request of await this.repository.listDocumentRequestsForAssignment(leadAssignmentId)) {
      if (request.status !== "open") continue;
      if (await this.cancelBySystem(request, reason, actor)) cancelled += 1;
    }
    return cancelled;
  }

  /** Spec 046 retention: labels and notes of these assignments are scrubbed (statuses and timestamps stay). */
  anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    return this.repository.anonymizeDocumentRequestsForAssignments(leadAssignmentIds, marker, now);
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private enabled(): boolean {
    return this.deps.isMessagingEnabled ? this.deps.isMessagingEnabled() : true;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private assertRead(channel: LeadMessagingChannel, actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (channel === "crm") this.deps.crmAccess.assertLeadRead(actor, assignment);
    else this.deps.starterAccess.assertLeadAccess(actor, assignment);
  }

  private assertMutation(channel: LeadMessagingChannel, actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (channel === "crm") this.deps.crmAccess.assertMutation(actor, assignment);
    else this.deps.starterAccess.assertMutationAccess(actor, assignment);
  }

  private quoteOf(quoteRequestId: string): Promise<Quote | undefined> {
    return this.deps.quotes.findById(quoteRequestId).catch(() => undefined);
  }

  private async safely(task: () => Promise<unknown> | undefined): Promise<void> {
    try {
      await task();
    } catch {
      // The request is already stored: a failing pointer notification must not fail the call.
    }
  }

  private async verifyVisitor(publicReference: string, token: string, actor: ActorContext): Promise<Quote> {
    const grant = await this.deps.visitorAccess?.verify(publicReference, token, actor);
    if (!grant) throw visitorAccessDenied();
    return grant.quote;
  }

  private async quoteAssignments(quoteRequestId: string): Promise<Map<string, LeadAssignmentRecord>> {
    return new Map((await this.deps.assignments.list()).filter((assignment) => assignment.quoteRequestId === quoteRequestId).map((assignment) => [assignment.id, assignment]));
  }

  private refuseAudit(actor: ActorContext, assignment: LeadAssignmentRecord, reason: string, context: Record<string, unknown>): void {
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.documentRequestRefused,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
      result: "refused",
      reason,
      context
    });
  }

  /** Requests of the broker currently assigned, after lazily closing the ones that no longer apply. */
  private async currentRequests(assignment: LeadAssignmentRecord, quote: Quote | undefined): Promise<LeadDocumentRequestRecord[]> {
    const all = await this.repository.listDocumentRequestsForAssignment(assignment.id);
    const result: LeadDocumentRequestRecord[] = [];
    for (const request of all) {
      const current = await this.reconcile(request, assignment, quote);
      if (current.partnerTenantId === assignment.partnerTenantId) result.push(current);
    }
    return result;
  }

  private async ownRequest(assignment: LeadAssignmentRecord, requestId: string): Promise<LeadDocumentRequestRecord> {
    const request = await this.repository.findDocumentRequest(requestId);
    if (!request || request.leadAssignmentId !== assignment.id || request.partnerTenantId !== assignment.partnerTenantId) {
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Document request not found" });
    }
    return request;
  }

  /**
   * An open request that no longer applies is cancelled by the system: reassigned to another broker,
   * or the lead is closed / the consent was withdrawn.
   */
  private async reconcile(request: LeadDocumentRequestRecord, assignment: LeadAssignmentRecord | undefined, quote: Quote | undefined): Promise<LeadDocumentRequestRecord> {
    if (request.status !== "open") return request;
    let reason: "reassigned" | "closed" | undefined;
    if (!assignment || assignment.partnerTenantId !== request.partnerTenantId) reason = "reassigned";
    else if (consentWithdrawn(quote) || leadState(assignment) === "closed") reason = "closed";
    if (!reason) return request;
    await this.cancelBySystem(request, reason);
    return (await this.repository.findDocumentRequest(request.id)) ?? request;
  }

  private async cancelBySystem(request: LeadDocumentRequestRecord, reason: "reassigned" | "closed", actor?: ActorContext): Promise<boolean> {
    try {
      await this.repository.transitionDocumentRequest(request.id, { status: "cancelled", cancelledAt: this.now(), cancelReason: reason });
    } catch {
      return false; // Already left the open state.
    }
    this.deps.audit.write({
      actor: actor ?? { actorId: "system:lead-messaging", roles: [] },
      action: LeadMessagingAuditActions.documentRequestCancelled,
      targetType: "LeadDocumentRequest",
      targetId: request.id,
      scope: { partnerTenantId: request.partnerTenantId, quoteRequestId: request.quoteRequestId, leadAssignmentId: request.leadAssignmentId },
      result: "success",
      context: { reason, by: "system" }
    });
    return true;
  }

  private createBlockers(assignment: LeadAssignmentRecord, quote: Quote | undefined, actor: ActorContext, openCount: number): DocumentRequestBlocker[] {
    const blockers: DocumentRequestBlocker[] = [];
    const blocker = brokerWriteBlocker(assignment, quote);
    if (blocker) blockers.push(blocker);
    if (actor.tenantReadOnly) blockers.push("partner_suspended");
    if (!this.enabled()) blockers.push("messaging_disabled");
    if (openCount >= DOCUMENT_REQUEST_MAX_OPEN) blockers.push("limit_reached");
    return blockers;
  }

  private async toBroker(request: LeadDocumentRequestRecord): Promise<BrokerDocumentRequest> {
    const documents = await this.deps.documents.listForDocumentRequest(request.quoteRequestId, request.id);
    return {
      id: request.id,
      label: request.label,
      ...(request.note ? { note: request.note } : {}),
      ...(request.dueAt ? { dueAt: request.dueAt.toISOString() } : {}),
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      ...(request.fulfilledAt ? { fulfilledAt: request.fulfilledAt.toISOString() } : {}),
      ...(request.cancelledAt ? { cancelledAt: request.cancelledAt.toISOString() } : {}),
      ...(request.cancelReason ? { cancelReason: request.cancelReason } : {}),
      ...(request.authorId ? { authorId: request.authorId } : {}),
      documents: documents
        .filter((document) => document.scanStatus === "clean" && document.status === "available")
        .map((document) => ({
          id: document.id,
          fileName: document.fileName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          uploadedAt: document.createdAt.toISOString()
        }))
    };
  }
}
