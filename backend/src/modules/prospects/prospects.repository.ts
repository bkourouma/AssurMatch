import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { ProspectRecord } from "./prospects.service";
import type { NormalizedProspectContact } from "./prospect-identity.service";

export const PROSPECTS_REPOSITORY = Symbol("PROSPECTS_REPOSITORY");

export interface ProspectsRepository extends RuntimeRepository {
  createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<ProspectRecord>;
  list(): Promise<ProspectRecord[]>;
  require(id: string): Promise<ProspectRecord>;
}

export class MemoryProspectsRepository implements ProspectsRepository {
  readonly mode = "memory-test" as const;
  private readonly prospects: ProspectRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProspectsRepository");
  }

  async createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<ProspectRecord> {
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

  async list(): Promise<ProspectRecord[]> {
    return [...this.prospects];
  }

  async require(id: string): Promise<ProspectRecord> {
    const prospect = this.prospects.find((candidate) => candidate.id === id);
    if (!prospect) throw new Error(`Prospect ${id} not found`);
    return prospect;
  }
}

type ProspectDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaProspectsRepository implements ProspectsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<ProspectRecord> {
    const existing = await this.client().findFirst({
      where: {
        countryId,
        productId,
        OR: [
          ...(contact.emailFingerprint ? [{ emailFingerprint: contact.emailFingerprint }] : []),
          ...(contact.phoneFingerprint ? [{ phoneFingerprint: contact.phoneFingerprint }] : [])
        ]
      }
    });
    if (existing) {
      const current = existing as ProspectRecord;
      const consentRecordIds = current.consentRecordIds.includes(consentRecordId) ? current.consentRecordIds : [...current.consentRecordIds, consentRecordId];
      return this.toDomain(await this.client().update({ where: { id: current.id }, data: { consentRecordIds, updatedAt: new Date() } }));
    }
    const now = new Date();
    return this.toDomain(await this.client().create({
      data: {
        id: crypto.randomUUID(),
        countryId,
        productId,
        emailNormalized: contact.emailNormalized,
        phoneNormalized: contact.phoneNormalized,
        emailFingerprint: contact.emailFingerprint,
        phoneFingerprint: contact.phoneFingerprint,
        displayName: contact.displayName,
        consentRecordIds: [consentRecordId],
        retentionUntil: new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      }
    }));
  }

  async list(): Promise<ProspectRecord[]> {
    return (await this.client().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDomain(row));
  }

  async require(id: string): Promise<ProspectRecord> {
    const row = await this.client().findUnique({ where: { id } });
    if (!row) throw new Error(`Prospect ${id} not found`);
    return this.toDomain(row);
  }

  private client(): ProspectDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { prospect: ProspectDelegate }).prospect;
  }

  private toDomain(row: unknown): ProspectRecord {
    return row as ProspectRecord;
  }
}
