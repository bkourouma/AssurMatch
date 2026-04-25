import { accreditationDocumentSchema, type AccreditationDocumentDto, type AccreditationDocumentRecord } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

export interface AccreditationDocument extends AccreditationDocumentRecord {
  id: string;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class S3CompatibleStorageAdapter {
  reference(storageKey: string): string {
    return `s3://assurmatch-foundation/${storageKey}`;
  }
}

export class DocumentsService {
  private readonly documents: AccreditationDocument[] = [];
  private readonly storage = new S3CompatibleStorageAdapter();

  constructor(private readonly audit: AuditLogWriter) {}

  register(input: AccreditationDocumentDto, actor: ActorContext): AccreditationDocument {
    const parsed = accreditationDocumentSchema.parse(input);
    const now = new Date();
    const document: AccreditationDocument = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      retentionUntil: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now
    };
    this.documents.push(document);
    this.audit.write({
      actor,
      action: "accreditation_document.registered",
      targetType: "AccreditationDocument",
      targetId: document.id,
      scope: { partnerTenantId: document.partnerTenantId },
      result: "success",
      context: { documentType: document.documentType, storageReference: this.storage.reference(document.storageKey) }
    });
    return document;
  }

  getAuthorized(id: string, actor: ActorContext): AccreditationDocument {
    const document = this.require(id);
    if (actor.partnerTenantId && actor.partnerTenantId !== document.partnerTenantId) {
      this.audit.write({
        actor,
        action: "accreditation_document.access_refused",
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
      action: "accreditation_document.accessed",
      targetType: "AccreditationDocument",
      targetId: id,
      scope: { partnerTenantId: document.partnerTenantId },
      result: "success",
      context: {}
    });
    return document;
  }

  acceptedForPartner(partnerTenantId: string): boolean {
    return this.documents.some((document) => document.partnerTenantId === partnerTenantId && document.status === "accepted");
  }

  require(id: string): AccreditationDocument {
    const document = this.documents.find((candidate) => candidate.id === id);
    if (!document) throw new Error(`Document ${id} not found`);
    return document;
  }
}

export class DocumentsModule {
  readonly service: DocumentsService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new DocumentsService(audit);
  }
}
