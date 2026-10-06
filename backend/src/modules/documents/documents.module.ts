import { createHash } from "node:crypto";
import {
  ACCREDITATION_DOCUMENT_MAX_BYTES,
  accreditationDocumentMimeTypes,
  accreditationDocumentSchema,
  type AccreditationDocumentDto,
  type AccreditationDocumentType
} from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { matchesFileSignature, safeUploadFileName } from "../common/files/file-signature";
import type { ActorContext } from "../common/types";
import { PartnerErrorCodes, partnerConflict, partnerNotFound, partnerUnprocessable } from "../partners/partner-errors";
import { isAcceptedCleanDocument } from "../partners/partner-lifecycle";
import { MemoryDocumentStorage, type DocumentStoragePort } from "../quote-documents/document-storage.port";
import { EicarSignatureScanner, type VirusScannerPort } from "../quote-documents/virus-scanner.port";
import {
  MemoryAccreditationDocumentsRepository,
  type AccreditationDocument,
  type AccreditationDocumentsRepository
} from "./accreditation-documents.repository";

export type { AccreditationDocument } from "./accreditation-documents.repository";

/** Shape multer hands over for a multipart `file` field (same as the quote documents). */
export interface UploadedAccreditationFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AccreditationDocumentUploadMetadata {
  documentType: AccreditationDocumentType;
  licenseId?: string | undefined;
  expirationDate?: string | undefined;
  reason: string;
}

export interface DocumentsServiceDeps {
  storage?: DocumentStoragePort | undefined;
  scanner?: VirusScannerPort | undefined;
  repository?: AccreditationDocumentsRepository | undefined;
  /** FR-008: production-like runtimes refuse uploads unless the storage is durable (S3), as for quote documents. */
  requireDurableStorage?: boolean | undefined;
}

const RETENTION_YEARS = 10;

export const AccreditationDocumentAuditActions = {
  registered: "accreditation_document.registered",
  uploaded: "accreditation_document.uploaded",
  uploadRefused: "accreditation_document.upload_refused",
  scanned: "accreditation_document.scanned",
  quarantined: "accreditation_document.quarantined",
  reviewed: "accreditation_document.reviewed",
  reviewRefused: "accreditation_document.review_refused",
  accessed: "accreditation_document.accessed",
  accessRefused: "accreditation_document.access_refused",
  downloaded: "accreditation_document.downloaded",
  downloadRefused: "accreditation_document.download_refused"
} as const;

/**
 * Spec 051 R5: accreditation documents are persisted (memory or Prisma repository), their bytes go
 * to the document storage of spec 033, and every upload is scanned synchronously by the configured
 * antivirus before it can be reviewed. An infected file is quarantined: never served, never accepted.
 * Role checks belong to the caller (PartnerAdminService); this service enforces the file rules.
 */
export class DocumentsService {
  private readonly repository: AccreditationDocumentsRepository;
  private readonly storage: DocumentStoragePort;
  private readonly scanner: VirusScannerPort;

  constructor(private readonly audit: AuditLogWriter, private readonly deps: DocumentsServiceDeps = {}) {
    this.repository = deps.repository ?? new MemoryAccreditationDocumentsRepository();
    this.storage = deps.storage ?? new MemoryDocumentStorage();
    this.scanner = deps.scanner ?? new EicarSignatureScanner();
  }

  /** Legacy metadata registration (no bytes, scan pending): never counts for eligibility. */
  async register(input: AccreditationDocumentDto, actor: ActorContext): Promise<AccreditationDocument> {
    const parsed = accreditationDocumentSchema.parse(input);
    const now = new Date();
    const document: AccreditationDocument = {
      id: parsed.id ?? crypto.randomUUID(),
      partnerTenantId: parsed.partnerTenantId,
      ...(parsed.licenseId ? { licenseId: parsed.licenseId } : {}),
      documentType: parsed.documentType,
      storageKey: parsed.storageKey,
      checksum: parsed.checksum,
      status: parsed.status,
      ...(parsed.expirationDate ? { expirationDate: parsed.expirationDate } : {}),
      scanStatus: "pending",
      retentionUntil: this.retentionUntil(now),
      ...(actor.actorId ? { createdById: actor.actorId } : {}),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(document);
    this.audit.write({
      actor,
      action: AccreditationDocumentAuditActions.registered,
      targetType: "AccreditationDocument",
      targetId: document.id,
      scope: { partnerTenantId: document.partnerTenantId },
      result: "success",
      context: { documentType: document.documentType, storageReference: this.storage.reference(document.storageKey) }
    });
    return document;
  }

  /** Legacy tenant check: a partner user never reads another partner's document. */
  async getAuthorized(id: string, actor: ActorContext): Promise<AccreditationDocument> {
    const document = await this.require(id);
    if (actor.partnerTenantId && actor.partnerTenantId !== document.partnerTenantId) {
      this.audit.write({
        actor,
        action: AccreditationDocumentAuditActions.accessRefused,
        targetType: "AccreditationDocument",
        targetId: id,
        scope: { partnerTenantId: document.partnerTenantId },
        result: "refused",
        reason: "cross-partner access denied",
        context: {}
      });
      throw new Error("Document access denied");
    }
    this.audit.write({
      actor,
      action: AccreditationDocumentAuditActions.accessed,
      targetType: "AccreditationDocument",
      targetId: id,
      scope: { partnerTenantId: document.partnerTenantId },
      result: "success",
      context: {}
    });
    return document;
  }

  /**
   * FR-008: MIME allow-list, signature bytes, 5 MB limit, sha256, durable storage outside local and
   * test, then a synchronous antivirus scan. The caller has authorised the actor and checked that
   * `licenseId` belongs to the partner.
   */
  async upload(actor: ActorContext, partnerTenantId: string, file: UploadedAccreditationFile | undefined, metadata: AccreditationDocumentUploadMetadata): Promise<AccreditationDocument> {
    const refuse = (refusal: string, code: string = PartnerErrorCodes.documentInvalid): never => {
      this.audit.write({
        actor,
        action: AccreditationDocumentAuditActions.uploadRefused,
        targetType: "PartnerTenant",
        targetId: partnerTenantId,
        scope: { partnerTenantId },
        result: "refused",
        reason: refusal,
        context: { documentType: metadata.documentType, requestReason: metadata.reason }
      });
      throw partnerUnprocessable(code, `Document refused: ${refusal}`);
    };
    if (this.deps.requireDurableStorage && this.storage.mode !== "s3") refuse("storage_not_configured", PartnerErrorCodes.storageNotConfigured);
    if (!file || file.size === 0 || file.buffer.length === 0) return refuse("file_missing");
    if (file.size > ACCREDITATION_DOCUMENT_MAX_BYTES || file.buffer.length > ACCREDITATION_DOCUMENT_MAX_BYTES) refuse("file_too_large");
    const mimeType = file.mimetype.toLowerCase();
    if (!(accreditationDocumentMimeTypes as readonly string[]).includes(mimeType)) refuse("mime_not_allowed");
    if (!matchesFileSignature(mimeType, file.buffer)) refuse("content_mismatch");

    const now = new Date();
    const document: AccreditationDocument = {
      id: crypto.randomUUID(),
      partnerTenantId,
      ...(metadata.licenseId ? { licenseId: metadata.licenseId } : {}),
      documentType: metadata.documentType,
      storageKey: `ad-${crypto.randomUUID()}`,
      checksum: `sha256:${createHash("sha256").update(file.buffer).digest("hex")}`,
      status: "uploaded",
      ...(metadata.expirationDate ? { expirationDate: metadata.expirationDate } : {}),
      fileName: safeUploadFileName(file.originalname),
      mimeType,
      sizeBytes: file.buffer.length,
      scanStatus: "pending",
      retentionUntil: this.retentionUntil(now),
      ...(actor.actorId ? { createdById: actor.actorId } : {}),
      createdAt: now,
      updatedAt: now
    };
    await this.storage.put(document.storageKey, file.buffer, mimeType);
    await this.repository.create(document);
    this.audit.write({
      actor,
      action: AccreditationDocumentAuditActions.uploaded,
      targetType: "AccreditationDocument",
      targetId: document.id,
      scope: { partnerTenantId },
      result: "success",
      reason: metadata.reason,
      context: {
        documentType: document.documentType,
        ...(document.licenseId ? { licenseId: document.licenseId } : {}),
        mimeType,
        sizeBytes: document.sizeBytes,
        storageReference: this.storage.reference(document.storageKey)
      }
    });
    return this.scan(document, actor);
  }

  /** FR-009: accept or reject a scanned, clean document. Quarantined or unscanned files cannot be accepted. */
  async review(id: string, decision: "accepted" | "rejected", reason: string, actor: ActorContext): Promise<AccreditationDocument> {
    const document = await this.require(id);
    const refuse = (refusal: string, error: Error): never => {
      this.audit.write({
        actor,
        action: AccreditationDocumentAuditActions.reviewRefused,
        targetType: "AccreditationDocument",
        targetId: id,
        scope: { partnerTenantId: document.partnerTenantId },
        result: "refused",
        reason: refusal,
        context: { decision, requestReason: reason, scanStatus: document.scanStatus, status: document.status }
      });
      throw error;
    };
    if (decision === "accepted" && document.scanStatus !== "clean") {
      refuse("document_not_clean", partnerUnprocessable(PartnerErrorCodes.documentQuarantined, `Document cannot be accepted: scan status ${document.scanStatus}`));
    }
    if (document.status !== "uploaded" && document.status !== "pending_review") {
      refuse("document_already_reviewed", partnerConflict(`Document already reviewed (${document.status})`));
    }
    const now = new Date();
    const updated = await this.repository.update(id, {
      status: decision,
      reviewReason: reason,
      ...(actor.actorId ? { reviewedById: actor.actorId } : {}),
      reviewedAt: now,
      updatedAt: now
    });
    this.audit.write({
      actor,
      action: AccreditationDocumentAuditActions.reviewed,
      targetType: "AccreditationDocument",
      targetId: id,
      scope: { partnerTenantId: document.partnerTenantId },
      result: "success",
      reason,
      context: { before: { status: document.status }, after: { status: decision }, documentType: document.documentType }
    });
    return updated;
  }

  /** FR-012: the bytes of a clean document. The caller authorises and audits the download. */
  async readFile(id: string): Promise<{ document: AccreditationDocument; bytes: Buffer }> {
    const document = await this.require(id);
    if (document.scanStatus !== "clean") throw partnerUnprocessable(PartnerErrorCodes.documentQuarantined, `Document not available: scan status ${document.scanStatus}`);
    const bytes = await this.storage.get(document.storageKey);
    if (!bytes) throw partnerNotFound("Document file not found in storage");
    return { document, bytes };
  }

  /** R14: at least one accepted and clean accreditation document for the partner. */
  async hasAcceptedCleanForPartner(partnerTenantId: string): Promise<boolean> {
    return (await this.repository.listForPartner(partnerTenantId)).some((document) => document.documentType !== "partnership_contract" && isAcceptedCleanDocument(document));
  }

  /** @deprecated kept for older callers; reads the persisted documents. */
  acceptedForPartner(partnerTenantId: string): Promise<boolean> {
    return this.hasAcceptedCleanForPartner(partnerTenantId);
  }

  listForPartner(partnerTenantId: string): Promise<AccreditationDocument[]> {
    return this.repository.listForPartner(partnerTenantId);
  }

  find(id: string): Promise<AccreditationDocument | undefined> {
    return this.repository.find(id);
  }

  async require(id: string): Promise<AccreditationDocument> {
    const document = await this.repository.find(id);
    if (!document) throw partnerNotFound(`Document ${id} not found`);
    return document;
  }

  private async scan(document: AccreditationDocument, actor: ActorContext): Promise<AccreditationDocument> {
    const bytes = await this.storage.get(document.storageKey);
    const result = bytes ? await this.scanner.scan(bytes) : { verdict: "failed" as const, engine: this.scanner.engine, detail: "storage_missing", signature: undefined };
    const now = new Date();
    const updated = await this.repository.update(document.id, { scanStatus: result.verdict, scanEngine: result.engine, scannedAt: now, updatedAt: now });
    this.audit.write({
      actor,
      action: result.verdict === "infected" ? AccreditationDocumentAuditActions.quarantined : AccreditationDocumentAuditActions.scanned,
      targetType: "AccreditationDocument",
      targetId: document.id,
      scope: { partnerTenantId: document.partnerTenantId },
      result: result.verdict === "failed" ? "failed" : "success",
      ...(result.verdict === "clean" ? {} : { reason: result.signature ?? result.detail ?? result.verdict }),
      context: { engine: result.engine, verdict: result.verdict }
    });
    return updated;
  }

  private retentionUntil(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear() + RETENTION_YEARS, now.getUTCMonth(), now.getUTCDate()));
  }
}

export class DocumentsModule {
  readonly service: DocumentsService;

  constructor(audit = new AuditLogWriter(), deps: DocumentsServiceDeps = {}) {
    this.service = new DocumentsService(audit, deps);
  }
}

export { MemoryAccreditationDocumentsRepository, PrismaAccreditationDocumentsRepository, type AccreditationDocumentsRepository } from "./accreditation-documents.repository";
