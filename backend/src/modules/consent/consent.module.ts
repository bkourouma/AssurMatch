import { consentRecordSchema, consentTextSchema, type ConsentRecordDto, type ConsentTextDto } from "../../../../packages/shared/contracts/compliance.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import type { ActorContext } from "../common/types";

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
  private readonly texts: ConsentText[] = [];
  private readonly records: ConsentRecord[] = [];
  private readonly retention = new RetentionPolicyService();

  constructor(private readonly audit: AuditLogWriter) {}

  createText(input: ConsentTextDto, actor: ActorContext): ConsentText {
    const parsed = consentTextSchema.parse(input);
    const now = new Date();
    const text: ConsentText = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.texts.push(text);
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

  publishText(id: string, actor: ActorContext): ConsentText {
    const text = this.requireText(id);
    if (text.status === "published") return text;
    text.status = "published";
    text.publishedAt = new Date();
    text.updatedAt = new Date();
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

  record(input: ConsentRecordDto, actor: ActorContext): ConsentRecord {
    const parsed = consentRecordSchema.parse(input);
    const now = new Date();
    const record: ConsentRecord = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      retentionUntil: this.retention.retentionUntil(now),
      createdAt: now,
      updatedAt: now
    };
    this.records.push(record);
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

  hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): boolean {
    if (!recordId) return false;
    return this.records.some((record) =>
      record.id === recordId &&
      record.purpose === purpose &&
      record.countryId === countryId &&
      (productId === undefined || record.productId === productId) &&
      record.status === "granted"
    );
  }

  searchRecords(actor: ActorContext): ConsentRecord[] {
    if (!actor.roles.some((role) => ["super_admin", "compliance_admin", "support_admin"].includes(role))) {
      throw new Error("Consent access denied");
    }
    return [...this.records];
  }

  listTexts(): ConsentText[] {
    return [...this.texts];
  }

  private requireText(id: string): ConsentText {
    const text = this.texts.find((candidate) => candidate.id === id);
    if (!text) throw new Error(`Consent text ${id} not found`);
    return text;
  }
}

export class ConsentModule {
  readonly service: ConsentService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new ConsentService(audit);
  }
}
