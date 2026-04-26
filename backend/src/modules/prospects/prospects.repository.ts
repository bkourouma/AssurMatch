import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { ProspectRecord } from "./prospects.service";
import type { NormalizedProspectContact } from "./prospect-identity.service";

export const PROSPECTS_REPOSITORY = Symbol("PROSPECTS_REPOSITORY");

export interface ProspectsRepository extends RuntimeRepository {
  createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): ProspectRecord;
  list(): ProspectRecord[];
  require(id: string): ProspectRecord;
}

export class MemoryProspectsRepository implements ProspectsRepository {
  readonly mode = "memory-test" as const;
  private readonly prospects: ProspectRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProspectsRepository");
  }

  createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): ProspectRecord {
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
