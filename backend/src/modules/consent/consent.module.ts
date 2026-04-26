import { consentRecordSchema, consentTextSchema, type ConsentRecordDto, type ConsentTextDto } from "../../../../packages/shared/contracts/compliance.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
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

  hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): Promise<boolean> {
    return this.repository.hasValidConsent(recordId, purpose, countryId, productId);
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

export { CONSENT_RECORDS_REPOSITORY, MemoryConsentRecordsRepository, type ConsentRecordsRepository } from "./consent-records.repository";
