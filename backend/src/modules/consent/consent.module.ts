import { consentRecordSchema, consentTextSchema, type ConsentRecordDto, type ConsentTextDto } from "../../../../packages/shared/contracts/compliance.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import type { ActorContext } from "../common/types";
import { MemoryConsentRecordsRepository, type ConsentRecordsRepository } from "./consent-records.repository";

export interface ConsentText extends ConsentTextDto {
  id: string;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentRecord extends ConsentRecordDto {
  id: string;
  /** Spec 045: stamped when the visitor revokes; the grant itself (text, hash, date) is kept. */
  withdrawnAt?: Date;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class ConsentService {
  private readonly retention = new RetentionPolicyService();

  constructor(private readonly audit: AuditLogWriter, private readonly repository: ConsentRecordsRepository = new MemoryConsentRecordsRepository()) {}

  async createText(input: ConsentTextDto, actor: ActorContext): Promise<ConsentText> {
    const parsed = consentTextSchema.parse(input);
    const now = new Date();
    const text: ConsentText = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.createText(text);
    this.audit.write({
      actor,
      action: "consent_text.created",
      targetType: "ConsentText",
      targetId: text.id,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "success",
      context: { purpose: text.purpose, version: text.version }
    });
    return text;
  }

  async publishText(id: string, actor: ActorContext): Promise<ConsentText> {
    const text = await this.requireText(id);
    if (text.status === "published") return text;
    text.status = "published";
    text.publishedAt = new Date();
    text.updatedAt = new Date();
    await this.repository.updateText(id, text);
    this.audit.write({
      actor,
      action: "consent_text.published",
      targetType: "ConsentText",
      targetId: text.id,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "success",
      context: { contentHash: text.contentHash }
    });
    return text;
  }

  updatePublishedText(): never {
    throw new Error("Published consent text is immutable; create a new version");
  }

  async record(input: ConsentRecordDto, actor: ActorContext): Promise<ConsentRecord> {
    const parsed = consentRecordSchema.parse(input);
    const now = new Date();
    const record: ConsentRecord = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      retentionUntil: this.retention.retentionUntil(now),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.createRecord(record);
    this.audit.write({
      actor,
      action: "consent_record.created",
      targetType: "ConsentRecord",
      targetId: record.id,
      scope: { countryId: record.countryId, productId: record.productId },
      result: "success",
      context: { purpose: record.purpose, intendedRecipient: record.intendedRecipient }
    });
    return record;
  }

  /**
   * Spec 045: the visitor revokes a transmission previously authorised. The record is flipped to
   * `withdrawn` and stamped, never deleted: the proof that the grant existed (consent text, hash,
   * granted date) has to outlive the revocation. Calling it twice is a no-op, so a retried request
   * or a double click can never rewrite the withdrawal date or duplicate the audit entry.
   */
  async withdraw(recordId: string, actor: ActorContext, reason: string): Promise<ConsentRecord> {
    const record = await this.repository.findRecord(recordId);
    if (!record) throw new Error(`Consent record ${recordId} not found`);
    if (record.status === "withdrawn") return record;
    const withdrawn = await this.repository.updateRecord(recordId, { status: "withdrawn", withdrawnAt: new Date() });
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.consentWithdrawnByVisitor,
      targetType: "ConsentRecord",
      targetId: recordId,
      scope: { countryId: record.countryId, ...(record.productId ? { productId: record.productId } : {}) },
      result: "success",
      reason,
      context: { purpose: record.purpose, intendedRecipient: record.intendedRecipient, previousStatus: record.status ?? "granted" }
    });
    return withdrawn;
  }

  hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): Promise<boolean> {
    return this.repository.hasValidConsent(recordId, purpose, countryId, productId);
  }

  /**
   * Internal lookup used by routing (spec 042) to read which recipients a consent covers. It is
   * not exposed over HTTP and carries no RBAC of its own: callers are already-authorised services.
   */
  findRecord(id: string): Promise<ConsentRecord | undefined> {
    return this.repository.findRecord(id);
  }

  async searchRecords(actor: ActorContext): Promise<ConsentRecord[]> {
    if (!actor.roles.some((role) => ["super_admin", "compliance_admin", "support_admin"].includes(role))) {
      throw new Error("Consent access denied");
    }
    return this.repository.searchRecords();
  }

  listTexts(): Promise<ConsentText[]> {
    return this.repository.listTexts();
  }

  private requireText(id: string): Promise<ConsentText> {
    return this.repository.requireText(id);
  }
}

export class ConsentModule {
  readonly service: ConsentService;

  constructor(audit = new AuditLogWriter(), repository?: ConsentRecordsRepository) {
    this.service = new ConsentService(audit, repository);
  }
}

export { CONSENT_RECORDS_REPOSITORY, MemoryConsentRecordsRepository, type ConsentRecordsRepository, type ConsentRecordUpdate } from "./consent-records.repository";
