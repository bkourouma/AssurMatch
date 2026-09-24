import { createHash } from "node:crypto";
import type { AdminQuoteDocument, AdminQuoteDocumentsResponse, QuoteDocument, QuoteDocumentUploadMetadata, QuoteDocumentsResponse } from "../../../../packages/shared/contracts/quote-document.contracts";
import { QUOTE_DOCUMENT_MAX_BYTES, QUOTE_DOCUMENT_MAX_PER_REQUEST, quoteDocumentMimeTypes, quoteDocumentUploadMetadataSchema } from "../../../../packages/shared/contracts/quote-document.contracts";
import type { BrokerCrmDocument } from "../../../../packages/shared/contracts/quote.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { QueuePort } from "../common/queues/queues.module";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { NotificationsService } from "../notifications/notifications.module";
import type { ProductsService } from "../products/products.module";
import type { QuoteRequestRecord, QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import type { DocumentStoragePort } from "./document-storage.port";
import { QuoteDocumentAuditActions } from "./quote-documents-audit-actions";
import { MemoryQuoteDocumentsRepository, type QuoteDocumentRecord, type QuoteDocumentsRepository } from "./quote-documents.repository";
import type { VirusScannerPort } from "./virus-scanner.port";

export interface UploadedDocumentFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface QuoteDocumentsDeps {
  audit: AuditLogWriter;
  storage: DocumentStoragePort;
  scanner: VirusScannerPort;
  queue: QueuePort;
  redis: RedisClientPort;
  submissions: QuoteSubmissionService;
  countries: CountriesService;
  products: ProductsService;
  assignments: LeadAssignmentService;
  crmDocuments: { addDocument(document: BrokerCrmDocument): Promise<BrokerCrmDocument> };
  notifications?: NotificationsService | undefined;
  isGlobalFlagEnabled: (key: string) => boolean;
  repository?: QuoteDocumentsRepository | undefined;
  /** Run the scan right after the response in-process (memory queue); tests set it to false and call processPendingScans(). */
  autoProcess?: boolean | undefined;
  /** Production-like runtimes refuse uploads unless the storage adapter is durable (S3). */
  requireDurableStorage?: boolean | undefined;
}

const RATE_LIMIT_MAX_PER_HOUR = 20;
const RETENTION_YEARS = 5;
const SYSTEM_ACTOR: ActorContext = { actorId: "system:quote-documents", roles: ["super_admin"], mfaVerified: true };

/**
 * Optional supporting documents on quote requests (QUOTE-004). Files are token-bound to the
 * visitor's request, allow-listed, size-limited, scanned asynchronously and only shared with the
 * partner broker that routing assigned. Bytes are never exposed through public or admin reads.
 */
export class QuoteDocumentsService {
  private readonly repository: QuoteDocumentsRepository;

  constructor(private readonly deps: QuoteDocumentsDeps) {
    this.repository = deps.repository ?? new MemoryQuoteDocumentsRepository();
  }

  async upload(publicReference: string, token: string, file: UploadedDocumentFile | undefined, metadata: QuoteDocumentUploadMetadata, actor: ActorContext, ipAddress = "unknown"): Promise<QuoteDocument> {
    const quote = await this.authenticate(publicReference, token, actor);
    const scope = await this.uploadScope(quote);
    if (!scope.enabled) this.refuse(actor, quote, "upload_disabled", "Document upload is disabled for this product");
    if (this.deps.requireDurableStorage && this.deps.storage.mode !== "s3") this.refuse(actor, quote, "storage_not_configured", "Document upload is disabled: storage_not_configured");
    const rateKey = `quote-documents:upload:${ipAddress}`;
    if (await this.deps.redis.incr(rateKey, 3600) > RATE_LIMIT_MAX_PER_HOUR) this.refuse(actor, quote, "rate_limited", "Rate limited: too many document uploads");
    const parsed = quoteDocumentUploadMetadataSchema.parse(metadata);
    if (!file || file.size === 0 || file.buffer.length === 0) this.refuse(actor, quote, "file_missing", "Invalid document: file_missing");
    if (file.size > QUOTE_DOCUMENT_MAX_BYTES || file.buffer.length > QUOTE_DOCUMENT_MAX_BYTES) this.refuse(actor, quote, "file_too_large", "Invalid document: file_too_large");
    const mimeType = file.mimetype.toLowerCase();
    if (!(quoteDocumentMimeTypes as readonly string[]).includes(mimeType)) this.refuse(actor, quote, "mime_not_allowed", "Invalid document: mime_not_allowed");
    if (!this.matchesMagicBytes(mimeType, file.buffer)) this.refuse(actor, quote, "content_mismatch", "Invalid document: content_mismatch");
    const existing = await this.repository.listForQuote(quote.id);
    if (existing.filter((document) => document.status !== "removed").length >= QUOTE_DOCUMENT_MAX_PER_REQUEST) this.refuse(actor, quote, "too_many_documents", "Invalid document: too_many_documents");

    const now = new Date();
    const record: QuoteDocumentRecord = {
      id: crypto.randomUUID(),
      quoteRequestId: quote.id,
      prospectId: quote.prospectId ?? null,
      label: parsed.label,
      documentKind: parsed.documentKind,
      fileName: this.safeFileName(file.originalname),
      mimeType,
      sizeBytes: file.buffer.length,
      checksum: createHash("sha256").update(file.buffer).digest("hex"),
      storageKey: `qd-${crypto.randomUUID()}`,
      scanStatus: "pending",
      scanEngine: null,
      scanSignature: null,
      scannedAt: null,
      status: "uploaded",
      sharedLeadAssignmentId: null,
      sharedAt: null,
      retentionUntil: new Date(Date.UTC(now.getUTCFullYear() + RETENTION_YEARS, now.getUTCMonth(), now.getUTCDate())),
      createdAt: now,
      updatedAt: now
    };
    await this.deps.storage.put(record.storageKey, file.buffer, mimeType);
    await this.repository.create(record);
    this.deps.audit.write({
      actor,
      action: QuoteDocumentAuditActions.uploaded,
      targetType: "QuoteRequestDocument",
      targetId: record.id,
      scope: { quoteRequestId: quote.id, countryId: quote.countryId, productId: quote.productId },
      result: "success",
      context: { documentKind: record.documentKind, mimeType, sizeBytes: record.sizeBytes, storageReference: this.deps.storage.reference(record.storageKey) }
    });
    const job = this.deps.queue.add("document-scans", "quote_document_scan", record.id, actor.correlationId);
    if (this.deps.autoProcess !== false) setImmediate(() => void this.processScan(record.id, job.id).catch(() => undefined));
    return this.toDto(record);
  }

  async list(publicReference: string, token: string, actor: ActorContext): Promise<QuoteDocumentsResponse> {
    const quote = await this.authenticate(publicReference, token, actor);
    const scope = await this.uploadScope(quote);
    const items = (await this.repository.listForQuote(quote.id)).filter((document) => document.status !== "removed");
    this.deps.audit.write({
      actor,
      action: QuoteDocumentAuditActions.listed,
      targetType: "QuoteRequest",
      targetId: quote.id,
      result: "success",
      context: { total: items.length }
    });
    return {
      generatedAt: new Date().toISOString(),
      publicReference: quote.publicReference,
      uploadEnabled: scope.enabled,
      remainingSlots: Math.max(0, QUOTE_DOCUMENT_MAX_PER_REQUEST - items.length),
      items: items.map((document) => this.toDto(document)),
      total: items.length
    };
  }

  async adminList(actor: ActorContext, quoteRequestId: string): Promise<AdminQuoteDocumentsResponse> {
    if (actor.mfaVerified !== true || !actor.roles.some((role) => roleHasPermission(role, "quote_requests:read"))) {
      this.deps.audit.write({ actor, action: QuoteDocumentAuditActions.adminRefused, targetType: "QuoteRequest", targetId: quoteRequestId, result: "refused", reason: actor.mfaVerified !== true ? "mfa_required" : "forbidden_role", context: {} });
      throw new Error("Quote document access denied");
    }
    const items = (await this.repository.listForQuote(quoteRequestId)).map((document) => this.toAdminDto(document));
    this.deps.audit.write({ actor, action: QuoteDocumentAuditActions.adminListed, targetType: "QuoteRequest", targetId: quoteRequestId, result: "success", context: { total: items.length } });
    return { generatedAt: new Date().toISOString(), quoteRequestId, items, total: items.length };
  }

  /** Scan gate: only `clean` documents become available and reach the assigned broker. */
  async processScan(documentId: string, jobId?: string): Promise<QuoteDocumentRecord> {
    const document = await this.repository.require(documentId);
    if (document.scanStatus !== "pending") return document;
    if (jobId) this.deps.queue.transition(jobId, "active");
    const bytes = await this.deps.storage.get(document.storageKey);
    const result = bytes ? await this.deps.scanner.scan(bytes) : { verdict: "failed" as const, engine: this.deps.scanner.engine, detail: "storage_missing" };
    const now = new Date();
    const status = result.verdict === "clean" ? "available" : result.verdict === "infected" ? "quarantined" : "uploaded";
    const updated = await this.repository.update(documentId, {
      scanStatus: result.verdict,
      scanEngine: result.engine,
      scanSignature: result.signature ?? null,
      scannedAt: now,
      status,
      updatedAt: now
    });
    this.deps.audit.write({
      actor: SYSTEM_ACTOR,
      action: result.verdict === "infected" ? QuoteDocumentAuditActions.quarantined : QuoteDocumentAuditActions.scanned,
      targetType: "QuoteRequestDocument",
      targetId: documentId,
      scope: { quoteRequestId: document.quoteRequestId },
      result: result.verdict === "failed" ? "failed" : "success",
      reason: result.verdict === "clean" ? undefined : result.signature ?? result.detail ?? result.verdict,
      context: { engine: result.engine, verdict: result.verdict }
    });
    if (jobId) this.deps.queue.transition(jobId, result.verdict === "failed" ? "retryable" : "completed", result.detail);
    if (result.verdict === "clean") await this.shareIfAssigned(updated);
    return updated;
  }

  async processPendingScans(limit = 50): Promise<number> {
    const pending = await this.repository.listPendingScans(limit);
    for (const document of pending) await this.processScan(document.id);
    return pending.length;
  }

  /** Called when a quote gets (re)assigned after documents were already uploaded. */
  async shareForAssignment(quoteRequestId: string, assignment: LeadAssignmentRecord): Promise<number> {
    let shared = 0;
    for (const document of await this.repository.listForQuote(quoteRequestId)) {
      if (document.status !== "available" || document.sharedLeadAssignmentId === assignment.id) continue;
      await this.share(document, assignment);
      shared += 1;
    }
    return shared;
  }

  private async shareIfAssigned(document: QuoteDocumentRecord): Promise<void> {
    const assignment = (await this.deps.assignments.list()).find((candidate) => candidate.quoteRequestId === document.quoteRequestId && candidate.status !== "closed" && candidate.status !== "rejected");
    if (assignment) await this.share(document, assignment);
  }

  private async share(document: QuoteDocumentRecord, assignment: LeadAssignmentRecord): Promise<void> {
    const crmDocument: BrokerCrmDocument & { partnerTenantId: string } = {
      id: crypto.randomUUID(),
      leadAssignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      label: `${document.label} (${document.documentKind}, fourni par le prospect)`,
      storageKey: document.storageKey,
      visibility: "prospect_provided",
      createdAt: new Date().toISOString()
    };
    await this.deps.crmDocuments.addDocument(crmDocument);
    await this.repository.update(document.id, { sharedLeadAssignmentId: assignment.id, sharedAt: new Date(), updatedAt: new Date() });
    await this.deps.notifications?.queuePaired({
      type: "broker_document_received",
      recipientScope: `partner:${assignment.partnerTenantId}`,
      payloadReference: document.id
    }, SYSTEM_ACTOR);
    this.deps.audit.write({
      actor: SYSTEM_ACTOR,
      action: QuoteDocumentAuditActions.shared,
      targetType: "QuoteRequestDocument",
      targetId: document.id,
      scope: { quoteRequestId: document.quoteRequestId, partnerTenantId: assignment.partnerTenantId, leadAssignmentId: assignment.id },
      result: "success",
      context: { visibility: "prospect_provided" }
    });
  }

  private async authenticate(publicReference: string, token: string, actor: ActorContext): Promise<QuoteRequestRecord> {
    const quote = await this.deps.submissions.authenticateVisitor(publicReference, token);
    if (!quote) {
      this.deps.audit.write({ actor, action: QuoteDocumentAuditActions.refused, targetType: "QuoteRequest", targetId: publicReference, result: "refused", reason: "quote_token_invalid", context: {} });
      throw new Error("Quote request not found");
    }
    return quote;
  }

  private async uploadScope(quote: QuoteRequestRecord): Promise<{ enabled: boolean }> {
    const [country, product] = await Promise.all([
      this.deps.countries.require(quote.countryId).catch(() => undefined),
      this.deps.products.require(quote.productId).catch(() => undefined)
    ]);
    const enabled = this.deps.isGlobalFlagEnabled("quote_request_enabled")
      && country?.flags.country_quote_enabled === true
      && product?.flags.product_quote_enabled === true
      && product?.flags.product_document_upload_enabled === true;
    return { enabled };
  }

  private matchesMagicBytes(mimeType: string, bytes: Buffer): boolean {
    if (mimeType === "application/pdf") return bytes.subarray(0, 4).toString("latin1") === "%PDF";
    if (mimeType === "image/jpeg") return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (mimeType === "image/png") return bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return false;
  }

  private safeFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? "document";
    return base.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "document";
  }

  private refuse(actor: ActorContext, quote: QuoteRequestRecord, reason: string, message: string): never {
    this.deps.audit.write({
      actor,
      action: QuoteDocumentAuditActions.refused,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: quote.countryId, productId: quote.productId },
      result: "refused",
      reason,
      context: {}
    });
    throw new Error(message);
  }

  private toDto(document: QuoteDocumentRecord): QuoteDocument {
    return {
      id: document.id,
      label: document.label,
      documentKind: document.documentKind,
      fileName: document.fileName,
      mimeType: document.mimeType as QuoteDocument["mimeType"],
      sizeBytes: document.sizeBytes,
      scanStatus: document.scanStatus,
      status: document.status,
      sharedWithBroker: Boolean(document.sharedLeadAssignmentId),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString()
    };
  }

  private toAdminDto(document: QuoteDocumentRecord): AdminQuoteDocument {
    return {
      ...this.toDto(document),
      quoteRequestId: document.quoteRequestId,
      checksum: document.checksum,
      scanEngine: document.scanEngine,
      scanSignature: document.scanSignature,
      retentionUntil: document.retentionUntil.toISOString()
    };
  }
}
