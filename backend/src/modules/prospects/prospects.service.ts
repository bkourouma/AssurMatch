import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { NormalizedProspectContact } from "./prospect-identity.service";

export interface ProspectRecord extends NormalizedProspectContact {
  id: string;
  countryId: string;
  productId: string;
  consentRecordIds: string[];
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class ProspectsService {
  private readonly prospects: ProspectRecord[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string, actor: ActorContext): ProspectRecord {
    const existing = this.prospects.find((prospect) =>
      prospect.countryId === countryId &&
      prospect.productId === productId &&
      (prospect.emailFingerprint === contact.emailFingerprint || prospect.phoneFingerprint === contact.phoneFingerprint)
    );
    if (existing) {
      if (!existing.consentRecordIds.includes(consentRecordId)) existing.consentRecordIds.push(consentRecordId);
      existing.updatedAt = new Date();
      return existing;
    }
    const now = new Date();
    const prospect: ProspectRecord = {
      id: crypto.randomUUID(),
      countryId,
      productId,
      ...contact,
      consentRecordIds: [consentRecordId],
      retentionUntil: new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now
    };
    this.prospects.push(prospect);
    this.audit.write({
      actor,
      action: "prospect.created",
      targetType: "Prospect",
      targetId: prospect.id,
      scope: { countryId, productId },
      result: "success",
      context: { emailFingerprint: prospect.emailFingerprint, phoneFingerprint: prospect.phoneFingerprint }
    });
    return prospect;
  }

  list(): ProspectRecord[] {
    return [...this.prospects];
  }

  require(id: string): ProspectRecord {
    const prospect = this.prospects.find((candidate) => candidate.id === id);
    if (!prospect) throw new Error(`Prospect ${id} not found`);
    return prospect;
  }
}
