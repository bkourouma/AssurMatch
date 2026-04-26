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
  createdAt: Date;
  updatedAt: Date;
}

export class ProspectsService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: ProspectsRepository = new MemoryProspectsRepository()) {}

  createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string, actor: ActorContext): ProspectRecord {
    const before = this.repository.list().length;
    const prospect = this.repository.createOrLink(countryId, productId, contact, consentRecordId);
    if (this.repository.list().length === before) return prospect;
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
    return this.repository.list();
  }

  require(id: string): ProspectRecord {
    return this.repository.require(id);
  }
}

export { PROSPECTS_REPOSITORY, MemoryProspectsRepository, type ProspectsRepository } from "./prospects.repository";
