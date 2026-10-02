import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { z } from "zod";
import { consentRecordSchema, consentTextSchema, consentTextTemplateSchema, type ConsentRecordDto, type ConsentTextDto, type ConsentTextRecord, type ConsentTextTemplate } from "../../../../packages/shared/contracts/compliance.contracts";
import {
  consentContentHash,
  findConsentContentIssues,
  normalizeConsentContent,
  resolveConsentContent,
  type ConsentContentIssueCode,
  type ConsentContentVariables
} from "../../../../packages/shared/contracts/consent-content";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import type { ActorContext } from "../common/types";
import { MemoryConsentRecordsRepository, type ConsentRecordsRepository } from "./consent-records.repository";

export interface ConsentText extends ConsentTextDto {
  id: string;
  publishedAt?: Date;
  /** Spec 050: stamped when the text is retired. */
  retiredAt?: Date;
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

  /**
   * Spec 050 R5: when content is supplied the hash is always computed here, from the normalised
   * template; a caller-supplied hash is ignored. A hash without content is still accepted for the
   * legacy fixtures, but such a text can never be published through the admin route.
   */
  async createText(input: ConsentTextDto, actor: ActorContext, reason?: string): Promise<ConsentText> {
    const content = typeof input.content === "string" && normalizeConsentContent(input.content) ? normalizeConsentContent(input.content) : undefined;
    const parsed = consentTextSchema.parse({
      ...input,
      ...(content ? { content, contentHash: consentContentHash(content) } : {})
    });
    await this.assertVersionAvailable(parsed, actor, reason);
    const now = new Date();
    const text: ConsentText = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    let created: ConsentText;
    try {
      created = await this.repository.createText(text);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.duplicateVersion(parsed, actor, reason);
      throw error;
    }
    this.audit.write({
      actor,
      action: ConsentTextAuditActions.created,
      targetType: "ConsentText",
      targetId: text.id,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { purpose: text.purpose, version: text.version, language: text.language, contentHash: text.contentHash }
    });
    return { ...text, ...created };
  }

  /**
   * Publishes a draft. When the text carries content, FR-012 is enforced: hash consistent with the
   * content, no forbidden wording and, for `lead_transmission`, the recipient variable and the
   * technical role of AssurMatch. `requireContent` (set by the admin route) also refuses a legacy
   * hash-only text. A published text is returned as is; a retired one cannot come back.
   */
  async publishText(id: string, actor: ActorContext, options: { requireContent?: boolean; reason?: string } = {}): Promise<ConsentText> {
    const text = await this.requireText(id);
    if (text.status === "published") return text;
    if (text.status === "retired") {
      this.refuse(actor, text, "consent_text_retired", options.reason);
      throw new ConflictException({ code: ErrorCodes.CONFLICT, message: "Consent text conflict: a retired text cannot be published again; create a new version" });
    }
    if (text.content || options.requireContent) {
      const issues = findConsentContentIssues({ purpose: text.purpose, content: text.content ?? null, contentHash: text.contentHash });
      if (issues.length > 0) {
        this.refuse(actor, text, issues.map((issue) => issue.code).join(","), options.reason, { issues });
        throw new UnprocessableEntityException({
          code: ErrorCodes.CONSENT_TEXT_INVALID,
          message: `Consent text cannot be published: ${issues.map((issue) => issue.detail ? `${issue.code} (${issue.detail})` : issue.code).join(", ")}`,
          blockers: issues.map((issue) => ({ section: "consent_text", control: issue.code, label: CONSENT_ISSUE_LABELS[issue.code], evidence: issue.detail ?? "" }))
        });
      }
    }
    const now = new Date();
    const published = await this.repository.updateText(id, { status: "published", publishedAt: now, updatedAt: now });
    this.audit.write({
      actor,
      action: ConsentTextAuditActions.published,
      targetType: "ConsentText",
      targetId: text.id,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "success",
      ...(options.reason ? { reason: options.reason } : {}),
      context: { contentHash: text.contentHash, version: text.version, language: text.language }
    });
    return { ...text, ...published, status: "published", publishedAt: now, updatedAt: now };
  }

  /** Spec 050: retiring is the only transition left to a published text. Calling it twice is a no-op. */
  async retireText(id: string, actor: ActorContext, reason?: string): Promise<ConsentText> {
    const text = await this.requireText(id);
    if (text.status === "retired") return text;
    const now = new Date();
    const retired = await this.repository.updateText(id, { status: "retired", retiredAt: now, updatedAt: now });
    this.audit.write({
      actor,
      action: ConsentTextAuditActions.retired,
      targetType: "ConsentText",
      targetId: text.id,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { previousStatus: text.status, version: text.version, language: text.language }
    });
    return { ...text, ...retired, status: "retired", retiredAt: now, updatedAt: now };
  }

  /** The template with its variables resolved for display; `null` for a legacy hash-only text. */
  resolveContent(text: Pick<ConsentText, "content" | "language">, variables: ConsentContentVariables = {}): string | null {
    if (!text.content) return null;
    return resolveConsentContent(text.content, text.language, variables);
  }

  /** Reference templates shipped with the seed (`scripts/preprod/seeds/reference/consent-templates.json`). */
  templates(): ConsentTextTemplate[] {
    return loadConsentTemplates();
  }

  updatePublishedText(): never {
    throw new ConflictException({ code: ErrorCodes.CONFLICT, message: "Published consent text is immutable; create a new version" });
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

  async findText(id: string): Promise<ConsentText | undefined> {
    return (await this.repository.listTexts()).find((text) => text.id === id);
  }

  private requireText(id: string): Promise<ConsentText> {
    return this.repository.requireText(id);
  }

  /** The unique key (purpose, country, product, channel, language, version), checked here because Postgres treats a null product as distinct. */
  private async assertVersionAvailable(text: ConsentTextRecord, actor: ActorContext, reason?: string): Promise<void> {
    const existing = (await this.repository.listTexts()).find((candidate) =>
      candidate.purpose === text.purpose &&
      candidate.countryId === text.countryId &&
      (candidate.productId ?? null) === (text.productId ?? null) &&
      candidate.channel === text.channel &&
      candidate.language === text.language &&
      candidate.version === text.version
    );
    if (existing) throw this.duplicateVersion(text, actor, reason);
  }

  private duplicateVersion(text: ConsentTextRecord, actor: ActorContext, reason?: string): ConflictException {
    this.audit.write({
      actor,
      action: ConsentTextAuditActions.createRefused,
      targetType: "ConsentText",
      targetId: `${text.purpose}:${text.countryId}:${text.productId ?? "all"}:${text.language}:${text.version}`,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "refused",
      reason: "duplicate_version",
      context: { requestReason: reason }
    });
    return new ConflictException({ code: ErrorCodes.CONFLICT, message: "Consent text conflict: this version already exists for the purpose, country, product, channel and language" });
  }

  private refuse(actor: ActorContext, text: ConsentText, refusal: string, requestReason?: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action: ConsentTextAuditActions.publicationRefused,
      targetType: "ConsentText",
      targetId: text.id,
      scope: { countryId: text.countryId, productId: text.productId },
      result: "refused",
      reason: refusal,
      context: { requestReason, version: text.version, language: text.language, ...context }
    });
  }
}

/**
 * Spec 050 FR-019: the most recent published text of the same purpose, country, product, channel
 * and language that was published after `text` (or after its creation when it never was). `undefined`
 * when `text` is still the current version.
 */
export function findSupersedingText<T extends Pick<ConsentText, "id" | "purpose" | "countryId" | "productId" | "channel" | "language" | "status" | "publishedAt" | "createdAt">>(text: T, all: T[]): T | undefined {
  const reference = new Date(text.publishedAt ?? text.createdAt).getTime();
  return all
    .filter((candidate) =>
      candidate.id !== text.id &&
      candidate.status === "published" &&
      candidate.purpose === text.purpose &&
      candidate.countryId === text.countryId &&
      (candidate.productId ?? null) === (text.productId ?? null) &&
      candidate.channel === text.channel &&
      candidate.language === text.language &&
      candidate.publishedAt !== undefined && candidate.publishedAt !== null &&
      new Date(candidate.publishedAt).getTime() > reference
    )
    .sort((left, right) => new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime())[0];
}

export const ConsentTextAuditActions = {
  created: "consent_text.created",
  createRefused: "consent_text.create_refused",
  published: "consent_text.published",
  publicationRefused: "consent_text.publication_refused",
  retired: "consent_text.retired"
} as const;

const CONSENT_ISSUE_LABELS: Record<ConsentContentIssueCode, string> = {
  content_missing: "Contenu du texte absent",
  content_hash_mismatch: "Empreinte incoherente avec le contenu",
  forbidden_wording: "Formulation reglementee interdite",
  recipient_variable_missing: "Destinataire {{brokerName}} absent",
  technical_role_missing: "Rappel du role technique d'AssurMatch absent"
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

let cachedTemplates: ConsentTextTemplate[] | undefined;

/**
 * Loaded from the repository file next to the reference seed, relative to this module so the API
 * runtime and the tests read the same file whatever the working directory. A missing or invalid
 * file yields an empty list: the admin screen then simply offers no template.
 */
export function loadConsentTemplates(): ConsentTextTemplate[] {
  if (cachedTemplates) return cachedTemplates;
  try {
    const path = fileURLToPath(new URL("../../../../scripts/preprod/seeds/reference/consent-templates.json", import.meta.url));
    cachedTemplates = z.array(consentTextTemplateSchema).parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    cachedTemplates = [];
  }
  return cachedTemplates;
}

export class ConsentModule {
  readonly service: ConsentService;

  constructor(audit = new AuditLogWriter(), repository?: ConsentRecordsRepository) {
    this.service = new ConsentService(audit, repository);
  }
}

export { CONSENT_RECORDS_REPOSITORY, MemoryConsentRecordsRepository, type ConsentRecordsRepository, type ConsentRecordUpdate } from "./consent-records.repository";
