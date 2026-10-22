import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { NormalizedProspectContact } from "./prospect-identity.service";
import { MemoryProspectsRepository, type ProspectsRepository } from "./prospects.repository";

export interface ProspectRecord extends NormalizedProspectContact {
  id: string;
  countryId: string;
  productId: string;
  consentRecordIds: string[];
  retentionUntil: Date;
  // Lot 6
  anonymizedAt?: Date | null;
  // Lot 6 (end)
  createdAt: Date;
  updatedAt: Date;
}

export class ProspectsService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: ProspectsRepository = new MemoryProspectsRepository()) {}

  async createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string, actor: ActorContext): Promise<ProspectRecord> {
    const { prospect, created } = await this.repository.createOrLinkWithOutcome(countryId, productId, contact, consentRecordId);
    if (!created) return prospect;
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

  list(): Promise<ProspectRecord[]> {
    return this.repository.list();
  }

  require(id: string): Promise<ProspectRecord> {
    return this.repository.require(id);
  }

  /** Lot 6 x lot 8: ids of the prospects carrying this exact normalised e-mail or phone. */
  findIdsByContact(kind: "email" | "phone", normalizedValue: string): Promise<string[]> {
    return this.repository.findIdsByContact(kind, normalizedValue);
  }
}

export { PROSPECTS_REPOSITORY, MemoryProspectsRepository, type ProspectsRepository } from "./prospects.repository";
