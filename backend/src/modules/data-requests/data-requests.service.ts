import { randomInt } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  adminDataRequestQuerySchema,
  canTransitionDataRequest,
  dataRequestCompleteSchema,
  dataRequestCreateSchema,
  dataRequestRejectSchema,
  DATA_REQUEST_DUE_DAYS,
  DATA_REQUEST_REFERENCE_ALPHABET,
  DATA_REQUEST_REFERENCE_LENGTH,
  DATA_REQUEST_REFERENCE_PREFIX,
  dataRequestTypeSchema,
  type AdminDataRequestDetail,
  type AdminDataRequestHistoryEntry,
  type AdminDataRequestList,
  type AdminDataRequestListItem,
  type DataRequestCreateResult,
  type DataRequestStatus,
  type VisitorDataRequestList
} from "../../../../packages/shared/contracts/data-requests";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { RetentionBatch, RetentionErasurePreviewRequest } from "../../../../packages/shared/contracts/data-retention.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { DataRequestAuditActions } from "../audit-logs/data-request-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { parseHttpInput } from "../common/http/zod-validation";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import { RetentionAccessRefusedError } from "../data-retention/data-retention.service";
import type { DataRequestNotificationsPort, MessagingQuote } from "../lead-messaging/lead-messaging.ports";
import { visitorAccessDenied } from "../quote-requests/quote-submission.service";
import { DuplicateDataRequestReferenceError, OpenDataRequestExistsError, type DataRequestRecord, type DataRequestsRepository } from "./data-requests.repository";

/** The slice of `DataRetentionService` the data requests use: a preview, and the batch it created. */
export interface DataRequestRetentionPort {
  previewErasure(input: RetentionErasurePreviewRequest, actor: ActorContext): Promise<RetentionBatch>;
  getBatch(batchId: string, actor: ActorContext): Promise<RetentionBatch>;
}

export interface DataRequestsServiceDeps {
  audit: AuditLogWriter;
  repository: DataRequestsRepository;
  /** Resolves the quote request of a data request (reference for the compliance team, e-mail pointers). */
  quotes: { findById(id: string): Promise<MessagingQuote | undefined> };
  /** Spec 054 token verification of every visitor route. */
  visitorAccess: { verify(publicReference: string, token: string, actor?: ActorContext): Promise<{ quote: MessagingQuote } | undefined> };
  abuseGuard?: PublicAbuseGuardService | undefined;
  redis?: RedisClientPort | undefined;
  notifications?: DataRequestNotificationsPort | undefined;
  retention: DataRequestRetentionPort;
  now?: () => Date;
}

export type DataRequestAccess = "full" | "minimal";

const SYSTEM_VISITOR: ActorContext = { actorId: "visitor", roles: [] };
/** compliance_admin and super_admin process the requests. */
const FULL_ROLES: ReadonlySet<AssurMatchRole> = new Set<AssurMatchRole>(["compliance_admin", "super_admin"]);
/** support_admin only sees reference, type, status and deadline. */
const MINIMAL_ROLES: ReadonlySet<AssurMatchRole> = new Set<AssurMatchRole>(["support_admin"]);
const OPEN_STATUSES: readonly DataRequestStatus[] = ["received", "in_review"];
const CREATE_LIMIT_PER_IP = 5;
const CREATE_LIMIT_PER_QUOTE = 3;
const CREATE_WINDOW_SECONDS = 3600;
const REFERENCE_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Free text of the preview reason: it must carry neither a contact detail nor the visitor's words (spec 046 reason rules). */
const ERASURE_PREVIEW_REASON = "Demande d'effacement de la personne concernee, suivie dans le registre des demandes de donnees";

function randomReference(): string {
  let suffix = "";
  for (let index = 0; index < DATA_REQUEST_REFERENCE_LENGTH; index += 1) {
    suffix += DATA_REQUEST_REFERENCE_ALPHABET[randomInt(DATA_REQUEST_REFERENCE_ALPHABET.length)];
  }
  return `${DATA_REQUEST_REFERENCE_PREFIX}${suffix}`;
}

function conflict(code: string, message: string, extra: Record<string, unknown> = {}): ConflictException {
  return new ConflictException({ code, message, ...extra });
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Data request not found" });
}

function locale(quote: Pick<MessagingQuote, "language">): "fr" | "en" {
  return quote.language === "en" ? "en" : "fr";
}

/**
 * Spec 062 (D-10): the data-subject requests (access, rectification, erasure) a visitor raises from
 * the tracking space, and the compliance workflow that processes them.
 *
 * - The visitor route works whether or not the messaging flag is on, and even after the consent was
 *   withdrawn (the right to erasure does not depend on the consent).
 * - Nothing is ever erased from here: `startErasure` only creates the spec 046 erasure preview;
 *   the approval and the execution stay in the retention batch flow, behind `retention_purge_enabled`.
 * - The visitor's free text (`detail`) and the decision note never reach a log, an audit entry or an e-mail.
 */
export class DataRequestsService {
  constructor(private readonly deps: DataRequestsServiceDeps) {}

  // -------------------------------------------------------------------------------------------
  // Visitor (token 054)
  // -------------------------------------------------------------------------------------------

  /**
   * `POST /quote-requests/:ref/data-requests?token=`. Order: per-IP limit, token (neutral 404),
   * honeypot (fake success, no write), validation, one open request per type, per-request limit.
   */
  async create(publicReference: string, token: string, input: unknown, context: { ipAddress?: string; actor?: ActorContext } = {}): Promise<DataRequestCreateResult> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({ scope: "data_request", ipAddress: context.ipAddress, limitPerWindow: CREATE_LIMIT_PER_IP, windowSeconds: CREATE_WINDOW_SECONDS });
    }
    const quote = await this.verifyVisitor(publicReference, token, actor);

    const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
    if (typeof raw.website === "string" && raw.website.trim().length > 0) {
      // Honeypot: a believable answer, nothing written, nothing sent.
      this.deps.audit.write({ actor, action: DataRequestAuditActions.refused, targetType: "QuoteRequest", targetId: quote.id, result: "refused", reason: "honeypot", context: {} });
      const type = dataRequestTypeSchema.safeParse(raw.type);
      return { reference: randomReference(), type: type.success ? type.data : "access", status: "received", acknowledgedByEmail: true };
    }
    const parsed = parseHttpInput(dataRequestCreateSchema, input ?? {});

    const open = await this.deps.repository.findOpen(quote.id, parsed.type);
    if (open) this.refuseAlreadyOpen(actor, open.id, open.reference, open.type);

    // Counted per request actually recorded: a refused duplicate or an invalid body costs nothing.
    if (this.deps.redis) {
      const count = await this.deps.redis.incr(QuoteRedisKeys.publicScopeRateLimit("data_request_quote", quote.id), CREATE_WINDOW_SECONDS);
      if (count > CREATE_LIMIT_PER_QUOTE) throw new Error("Rate limit exceeded for public submissions");
    }

    const now = this.now();
    const record = await this.insert(actor, {
      id: crypto.randomUUID(),
      reference: randomReference(),
      quoteRequestId: quote.id,
      type: parsed.type,
      status: "received",
      ...(parsed.detail ? { detail: parsed.detail } : {}),
      locale: locale(quote),
      dueAt: new Date(now.getTime() + DATA_REQUEST_DUE_DAYS * DAY_MS),
      createdAt: now,
      updatedAt: now
    });
    // Identifiers and the type only: never the detail text.
    this.deps.audit.write({
      actor,
      action: DataRequestAuditActions.created,
      targetType: "DataRequest",
      targetId: record.id,
      result: "success",
      context: { reference: record.reference, type: record.type, quoteRequestId: quote.id, hasDetail: Boolean(record.detail) }
    });
    await this.acknowledge(record, quote, actor);
    await this.alertCompliance(record, actor);
    return { reference: record.reference, type: record.type, status: "received", acknowledgedByEmail: true };
  }

  /** `GET /quote-requests/:ref/data-requests?token=`: the requests of this quote request only. */
  async listForVisitor(publicReference: string, token: string, context: { actor?: ActorContext } = {}): Promise<VisitorDataRequestList> {
    const quote = await this.verifyVisitor(publicReference, token, context.actor ?? SYSTEM_VISITOR);
    const records = await this.deps.repository.listForQuote(quote.id);
    return {
      items: records.map((record) => ({
        reference: record.reference,
        type: record.type,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
        dueAt: record.dueAt.toISOString(),
        ...(record.decidedAt ? { closedAt: record.decidedAt.toISOString() } : {})
      }))
    };
  }

  // -------------------------------------------------------------------------------------------
  // Admin (compliance_admin / super_admin; support_admin reads the minimal fields)
  // -------------------------------------------------------------------------------------------

  /** Lets the HTTP layer run the audited access check before it parses a path parameter or a body. */
  authorize(actor: ActorContext, mode: "read" | "write", targetId = "queue"): DataRequestAccess {
    if (actor.mfaVerified !== true) this.refuseAccess(actor, "mfa_required", targetId, ErrorCodes.MFA_REQUIRED);
    const full = actor.roles.some((role) => FULL_ROLES.has(role));
    if (full) return "full";
    if (mode === "read" && actor.roles.some((role) => MINIMAL_ROLES.has(role))) return "minimal";
    return this.refuseAccess(actor, "forbidden_role", targetId, ErrorCodes.RBAC_DENIED);
  }

  async list(actor: ActorContext, rawQuery: unknown): Promise<AdminDataRequestList> {
    const access = this.authorize(actor, "read");
    const query = parseHttpInput(adminDataRequestQuerySchema, rawQuery ?? {});
    const after = this.decodeCursor(query.cursor);
    const rows = await this.deps.repository.list({ status: query.status, type: query.type, after, limit: query.limit + 1 });
    const page = rows.slice(0, query.limit);
    const now = this.now();
    const quotes = access === "full" ? await this.quotesOf(page) : new Map<string, MessagingQuote>();
    const last = page.at(-1);
    return {
      items: page.map((record) => this.toListItem(record, access, now, quotes.get(record.quoteRequestId))),
      nextCursor: rows.length > query.limit && last ? this.encodeCursor(last) : null
    };
  }

  async get(actor: ActorContext, id: string): Promise<AdminDataRequestDetail> {
    const access = this.authorize(actor, "read", id);
    const record = await this.require(id);
    if (access === "full") {
      this.deps.audit.write({ actor, action: DataRequestAuditActions.adminViewed, targetType: "DataRequest", targetId: record.id, result: "success", context: { reference: record.reference } });
    }
    return this.toDetail(record, access, actor);
  }

  /** `received -> in_review`. */
  async take(actor: ActorContext, id: string): Promise<AdminDataRequestDetail> {
    this.authorize(actor, "write", id);
    const record = await this.require(id);
    const now = this.now();
    const updated = await this.move(actor, record, ["received"], "in_review", { status: "in_review", reviewedById: actor.actorId, reviewedAt: now }, now);
    this.audit(actor, DataRequestAuditActions.taken, updated, { from: record.status });
    return this.toDetail(updated, "full", actor);
  }

  /** `received|in_review -> completed`; the visitor gets the closing pointer e-mail. */
  async complete(actor: ActorContext, id: string, input: unknown): Promise<AdminDataRequestDetail> {
    this.authorize(actor, "write", id);
    const body = parseHttpInput(dataRequestCompleteSchema, input ?? {});
    return this.close(actor, id, "completed", body.note, DataRequestAuditActions.completed);
  }

  /** `received|in_review -> rejected`; the internal note is mandatory and never sent to the visitor. */
  async reject(actor: ActorContext, id: string, input: unknown): Promise<AdminDataRequestDetail> {
    this.authorize(actor, "write", id);
    const body = parseHttpInput(dataRequestRejectSchema, input ?? {});
    return this.close(actor, id, "rejected", body.note, DataRequestAuditActions.rejected);
  }

  /**
   * Erasure requests only. Creates the spec 046 erasure PREVIEW for the visitor's public reference
   * and links it; it never approves nor executes a batch: whether anything is erased stays a
   * separate, explicit decision in the retention flow (and needs `retention_purge_enabled`).
   */
  async startErasure(actor: ActorContext, id: string): Promise<AdminDataRequestDetail> {
    this.authorize(actor, "write", id);
    const record = await this.require(id);
    if (record.type !== "erasure") this.refuseTransition(actor, record, "not_an_erasure_request", "Only an erasure request can start an erasure preview");
    if (!OPEN_STATUSES.includes(record.status)) this.refuseTransition(actor, record, "request_closed", `The request is already ${record.status}`);
    const quote = await this.deps.quotes.findById(record.quoteRequestId);
    if (!quote) this.refuseTransition(actor, record, "quote_request_unavailable", "The quote request of this data request is no longer available");
    // Taken before the preview exists, so the history reads "taken" then "erasure_started".
    const now = this.now();
    let batch: RetentionBatch;
    try {
      batch = await this.deps.retention.previewErasure({ publicReference: quote.publicReference, reason: ERASURE_PREVIEW_REASON }, actor);
    } catch (error) {
      if (error instanceof RetentionAccessRefusedError) {
        this.audit(actor, DataRequestAuditActions.refused, record, { reason: "retention_access_refused" }, "refused");
        throw new ForbiddenException({ code: ErrorCodes.RBAC_DENIED, message: error.message });
      }
      throw error;
    }
    const moved = await this.deps.repository.transition(record.id, OPEN_STATUSES, {
      status: "in_review",
      erasureBatchId: batch.id,
      ...(record.status === "received" ? { reviewedById: actor.actorId, reviewedAt: now } : {})
    }, now);
    if (!moved) this.refuseTransition(actor, record, "concurrent_change", "The request changed while the preview was created");
    this.audit(actor, DataRequestAuditActions.erasureStarted, moved, { batchId: batch.id, from: record.status });
    return this.toDetail(moved, "full", actor);
  }

  // -------------------------------------------------------------------------------------------
  // Spec 046 retention
  // -------------------------------------------------------------------------------------------

  /** Replaces the free text (`detail`, `decisionNote`); reference, type, status and timestamps stay. */
  anonymizeForQuote(quoteRequestId: string, marker: string, now: Date): Promise<void> {
    return this.deps.repository.anonymizeForQuote(quoteRequestId, marker, now);
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  private async close(actor: ActorContext, id: string, to: "completed" | "rejected", note: string | undefined, action: string): Promise<AdminDataRequestDetail> {
    const record = await this.require(id);
    const now = this.now();
    const updated = await this.move(actor, record, OPEN_STATUSES, to, { status: to, decidedById: actor.actorId, decidedAt: now, ...(note ? { decisionNote: note } : {}) }, now);
    this.audit(actor, action, updated, { from: record.status, hasNote: Boolean(note) });
    const quote = await this.deps.quotes.findById(record.quoteRequestId).catch(() => undefined);
    if (quote && !quote.anonymizedAt) {
      // A pointer only: no decision note and no reason travel in the e-mail.
      await this.deps.notifications?.queueVisitorClosure({ id: quote.id, publicReference: quote.publicReference }, { dataRequestId: updated.id, reference: updated.reference }, actor).catch(() => undefined);
    }
    return this.toDetail(updated, "full", actor);
  }

  /** Validates the transition, then writes it conditionally on the status it was validated against. */
  private async move(
    actor: ActorContext,
    record: DataRequestRecord,
    from: readonly DataRequestStatus[],
    to: DataRequestStatus,
    patch: Parameters<DataRequestsRepository["transition"]>[2],
    now: Date
  ): Promise<DataRequestRecord> {
    if (!canTransitionDataRequest(record.status, to) || !from.includes(record.status)) {
      this.refuseTransition(actor, record, `invalid_transition_${record.status}_to_${to}`, `A ${record.status} request cannot become ${to}`);
    }
    const updated = await this.deps.repository.transition(record.id, from, patch, now);
    if (!updated) this.refuseTransition(actor, record, "concurrent_change", "The request changed in the meantime");
    return updated;
  }

  private refuseTransition(actor: ActorContext, record: DataRequestRecord, reason: string, message: string): never {
    this.audit(actor, DataRequestAuditActions.refused, record, { reason, status: record.status }, "refused");
    throw conflict(ErrorCodes.DATA_REQUEST_INVALID_TRANSITION, message);
  }

  private refuseAccess(actor: ActorContext, reason: string, targetId: string, code: string): never {
    this.deps.audit.write({
      actor,
      action: DataRequestAuditActions.refused,
      targetType: "DataRequest",
      targetId,
      scope: { roles: actor.roles },
      result: "refused",
      reason
    });
    throw new ForbiddenException({ code, message: reason === "mfa_required" ? "MFA required" : "RBAC denied" });
  }

  private audit(actor: ActorContext, action: string, record: DataRequestRecord, context: Record<string, unknown>, result: "success" | "refused" = "success"): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: "DataRequest",
      targetId: record.id,
      result,
      ...(result === "refused" && typeof context.reason === "string" ? { reason: context.reason } : {}),
      // Reference, type and statuses only: never the visitor's detail or the decision note.
      context: { reference: record.reference, type: record.type, ...context }
    });
  }

  /** The refusal of a second open request of the same type, with the reference of the one already open. */
  private refuseAlreadyOpen(actor: ActorContext, targetId: string, reference: string | undefined, type: string): never {
    this.deps.audit.write({
      actor,
      action: DataRequestAuditActions.refused,
      targetType: "DataRequest",
      targetId,
      result: "refused",
      reason: "already_open",
      context: { ...(reference ? { reference } : {}), type }
    });
    throw conflict(ErrorCodes.DATA_REQUEST_ALREADY_OPEN, "A request of this type is already being processed", reference ? { reference } : {});
  }

  private async insert(actor: ActorContext, record: DataRequestRecord): Promise<DataRequestRecord> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.deps.repository.create(record);
      } catch (error) {
        // Two concurrent creations: the partial unique index let one through, this one gets the same refusal as a sequential duplicate.
        if (error instanceof OpenDataRequestExistsError) {
          const open = await this.deps.repository.findOpen(record.quoteRequestId, record.type);
          this.refuseAlreadyOpen(actor, open?.id ?? record.quoteRequestId, open?.reference ?? error.reference, record.type);
        }
        if (!(error instanceof DuplicateDataRequestReferenceError) || attempt >= REFERENCE_ATTEMPTS) throw error;
        record = { ...record, reference: randomReference() };
      }
    }
  }

  private async acknowledge(record: DataRequestRecord, quote: MessagingQuote, actor: ActorContext): Promise<void> {
    if (!this.deps.notifications) return;
    try {
      await this.deps.notifications.queueVisitorAcknowledgement(
        { id: quote.id, publicReference: quote.publicReference },
        { dataRequestId: record.id, reference: record.reference, requestType: record.type, dueAt: record.dueAt.toISOString() },
        actor
      );
      await this.deps.repository.markAcknowledged(record.id, this.now());
    } catch {
      // The request is recorded; a failed acknowledgement is retried by the notification backlog, never surfaced to the visitor.
    }
  }

  private async alertCompliance(record: DataRequestRecord, actor: ActorContext): Promise<void> {
    try {
      await this.deps.notifications?.queueComplianceAlert({ dataRequestId: record.id, reference: record.reference, requestType: record.type }, actor);
    } catch {
      // Same rule: the compliance queue lists the request whatever happens to the alert.
    }
  }

  private async verifyVisitor(publicReference: string, token: string, actor: ActorContext): Promise<MessagingQuote> {
    const grant = await this.deps.visitorAccess.verify(publicReference, token, actor);
    if (!grant) throw visitorAccessDenied();
    return grant.quote;
  }

  private async require(id: string): Promise<DataRequestRecord> {
    const record = await this.deps.repository.find(id);
    if (!record) throw notFound();
    return record;
  }

  private async quotesOf(records: readonly DataRequestRecord[]): Promise<Map<string, MessagingQuote>> {
    const quotes = new Map<string, MessagingQuote>();
    for (const quoteRequestId of new Set(records.map((record) => record.quoteRequestId))) {
      const quote = await this.deps.quotes.findById(quoteRequestId).catch(() => undefined);
      if (quote) quotes.set(quoteRequestId, quote);
    }
    return quotes;
  }

  private toListItem(record: DataRequestRecord, access: DataRequestAccess, now: Date, quote: MessagingQuote | undefined): AdminDataRequestListItem {
    return {
      id: record.id,
      reference: record.reference,
      type: record.type,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      dueAt: record.dueAt.toISOString(),
      overdue: OPEN_STATUSES.includes(record.status) && record.dueAt.getTime() < now.getTime(),
      ...(access === "full" ? { locale: record.locale, ...(quote ? { quoteReference: quote.publicReference } : {}) } : {})
    };
  }

  private async toDetail(record: DataRequestRecord, access: DataRequestAccess, actor: ActorContext): Promise<AdminDataRequestDetail> {
    const now = this.now();
    if (access === "minimal") return { ...this.toListItem(record, access, now, undefined), history: [] };
    const quote = await this.deps.quotes.findById(record.quoteRequestId).catch(() => undefined);
    return {
      ...this.toListItem(record, access, now, quote),
      quoteRequestId: record.quoteRequestId,
      ...(quote ? { publicReference: quote.publicReference } : {}),
      ...(record.detail ? { detail: record.detail } : {}),
      ...(record.acknowledgedAt ? { acknowledgedAt: record.acknowledgedAt.toISOString() } : {}),
      ...(record.reviewedById ? { reviewedById: record.reviewedById } : {}),
      ...(record.reviewedAt ? { reviewedAt: record.reviewedAt.toISOString() } : {}),
      ...(record.decidedById ? { decidedById: record.decidedById } : {}),
      ...(record.decidedAt ? { decidedAt: record.decidedAt.toISOString() } : {}),
      ...(record.decisionNote ? { decisionNote: record.decisionNote } : {}),
      ...(record.erasureBatchId ? { erasureBatchId: record.erasureBatchId } : {}),
      erasureAllowed: record.type === "erasure" && OPEN_STATUSES.includes(record.status),
      history: await this.history(record, actor)
    };
  }

  private async history(record: DataRequestRecord, actor: ActorContext): Promise<AdminDataRequestHistoryEntry[]> {
    const entries: Array<AdminDataRequestHistoryEntry & { time: number }> = [];
    const push = (action: string, at: Date, actorId?: string) => entries.push({ action, at: at.toISOString(), time: at.getTime(), ...(actorId ? { actorId } : {}) });
    push("created", record.createdAt);
    if (record.reviewedAt) push("taken", record.reviewedAt, record.reviewedById);
    if (record.erasureBatchId) {
      const batch = await this.deps.retention.getBatch(record.erasureBatchId, actor).catch(() => undefined);
      if (batch) push("erasure_started", new Date(batch.createdAt), batch.requestedById ?? undefined);
    }
    if (record.decidedAt && (record.status === "completed" || record.status === "rejected")) push(record.status, record.decidedAt, record.decidedById);
    return entries.sort((left, right) => left.time - right.time).map(({ time: _time, ...entry }) => entry);
  }

  private encodeCursor(record: DataRequestRecord): string {
    return Buffer.from(JSON.stringify({ createdAt: record.createdAt.toISOString(), id: record.id })).toString("base64url");
  }

  private decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | undefined {
    if (!cursor) return undefined;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
      const createdAt = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : undefined;
      if (createdAt && !Number.isNaN(createdAt.getTime()) && typeof parsed.id === "string") return { createdAt, id: parsed.id };
    } catch {
      // falls through to the validation error below
    }
    throw new BadRequestException({ message: "Validation failed", issues: [{ path: "cursor", message: "Invalid cursor" }] });
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
