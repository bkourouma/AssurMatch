import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { ProspectRecord } from "./prospects.service";
import type { NormalizedProspectContact } from "./prospect-identity.service";
// Lot 8 (spec 075 FR-A1/A2): column encryption and blind indexes live in common/security.
import { prospectContactColumns, prospectContactLookup, prospectContactMatch, prospectRowToDomain } from "../common/security/pii-columns";
import { legacyPiiFingerprint, PiiVault, type BlindIndexKind } from "../common/security/pii-vault";

export const PROSPECTS_REPOSITORY = Symbol("PROSPECTS_REPOSITORY");

function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Spec 066 F1: two submissions share one prospect profile only when they carry the same e-mail,
 * the same phone and the same name. A phone shared by two people (family, office, relay) must not
 * route one visitor's e-mails and tracking link to the other one.
 */
function isSameContact(prospect: Pick<ProspectRecord, "emailFingerprint" | "phoneFingerprint" | "displayName">, contact: NormalizedProspectContact): boolean {
  return Boolean(prospect.emailFingerprint) &&
    prospect.emailFingerprint === contact.emailFingerprint &&
    prospect.phoneFingerprint === contact.phoneFingerprint &&
    nameKey(prospect.displayName) === nameKey(contact.displayName);
}

export interface ProspectsRepository extends RuntimeRepository {
  createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<ProspectRecord>;
  /**
   * Same as `createOrLink`, and tells whether the prospect was created. Spec 059 follow-up: the
   * service used to list every prospect twice to find out, which made each quote submission O(n).
   */
  createOrLinkWithOutcome(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<{ prospect: ProspectRecord; created: boolean }>;
  list(): Promise<ProspectRecord[]>;
  require(id: string): Promise<ProspectRecord>;
  /**
   * Lot 6 x lot 8 (spec 073 FR-003): ids of the prospects carrying this exact e-mail or phone
   * (normalised value), anonymised ones included (their contact is erased, so they never match).
   */
  findIdsByContact(kind: BlindIndexKind, normalizedValue: string): Promise<string[]>;
}

export class MemoryProspectsRepository implements ProspectsRepository {
  readonly mode = "memory-test" as const;
  private readonly prospects: ProspectRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProspectsRepository");
  }

  async createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<ProspectRecord> {
    return (await this.createOrLinkWithOutcome(countryId, productId, contact, consentRecordId)).prospect;
  }

  async createOrLinkWithOutcome(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<{ prospect: ProspectRecord; created: boolean }> {
    // Spec 066 F1: a profile is reused only for the very same contact (e-mail AND phone AND name).
    const existing = this.prospects.find((prospect) =>
      prospect.countryId === countryId &&
      prospect.productId === productId &&
      isSameContact(prospect, contact)
    );
    if (existing) {
      if (!existing.consentRecordIds.includes(consentRecordId)) existing.consentRecordIds.push(consentRecordId);
      existing.updatedAt = new Date();
      return { prospect: existing, created: false };
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
    return { prospect, created: true };
  }

  async list(): Promise<ProspectRecord[]> {
    return [...this.prospects];
  }

  async require(id: string): Promise<ProspectRecord> {
    const prospect = this.prospects.find((candidate) => candidate.id === id);
    if (!prospect) throw new Error(`Prospect ${id} not found`);
    return prospect;
  }

  async findIdsByContact(kind: BlindIndexKind, normalizedValue: string): Promise<string[]> {
    // Memory records are clear (no vault): the legacy fingerprint is their only lookup key.
    const fingerprint = legacyPiiFingerprint(normalizedValue);
    return this.prospects
      .filter((prospect) => (kind === "email" ? prospect.emailFingerprint : prospect.phoneFingerprint) === fingerprint)
      .map((prospect) => prospect.id);
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

  // Lot 8: the vault is injectable (tests); the runtime builds it from the environment.
  constructor(private readonly prisma: PrismaService, private readonly vault: PiiVault = PiiVault.fromEnv()) {}

  async createOrLink(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<ProspectRecord> {
    return (await this.createOrLinkWithOutcome(countryId, productId, contact, consentRecordId)).prospect;
  }

  async createOrLinkWithOutcome(countryId: string, productId: string, contact: NormalizedProspectContact, consentRecordId: string): Promise<{ prospect: ProspectRecord; created: boolean }> {
    // Spec 066 F1: never merge on a phone alone. The e-mail and the phone must both match; the name
    // is compared on the candidates (it has no fingerprint column), so a request always reaches the
    // contact entered in that very submission.
    // Lot 8: encrypted rows match on the blind indexes, legacy clear rows on the old fingerprints (OR);
    // candidates are decrypted first, so the F1 comparison below is unchanged.
    const candidates = (await this.client().findMany({
      where: { countryId, productId, anonymizedAt: null, ...prospectContactMatch(this.vault, contact) },
      orderBy: { createdAt: "asc" }
    })).map((row) => this.toDomain(row));
    const existing = candidates.find((row) => isSameContact(row, contact));
    if (existing) {
      const current = existing as ProspectRecord;
      const consentRecordIds = current.consentRecordIds.includes(consentRecordId) ? current.consentRecordIds : [...current.consentRecordIds, consentRecordId];
      return { prospect: this.toDomain(await this.client().update({ where: { id: current.id }, data: { consentRecordIds, updatedAt: new Date() } })), created: false };
    }
    const now = new Date();
    const created = this.toDomain(await this.client().create({
      data: {
        id: crypto.randomUUID(),
        countryId,
        productId,
        // Lot 8: envelopes + blind indexes + key id when encrypted, the clear columns otherwise.
        ...prospectContactColumns(this.vault, contact),
        displayName: contact.displayName,
        consentRecordIds: [consentRecordId],
        retentionUntil: new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      }
    }));
    return { prospect: created, created: true };
  }

  async list(): Promise<ProspectRecord[]> {
    return (await this.client().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDomain(row));
  }

  async require(id: string): Promise<ProspectRecord> {
    const row = await this.client().findUnique({ where: { id } });
    if (!row) throw new Error(`Prospect ${id} not found`);
    return this.toDomain(row);
  }

  async findIdsByContact(kind: BlindIndexKind, normalizedValue: string): Promise<string[]> {
    // Lot 8: blind index for the encrypted rows OR legacy fingerprint for the clear ones; ids only.
    const rows = await this.client().findMany({ where: prospectContactLookup(this.vault, kind, normalizedValue), select: { id: true } }) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private client(): ProspectDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { prospect: ProspectDelegate }).prospect;
  }

  private toDomain(row: unknown): ProspectRecord {
    // Lot 8: clear contact for the domain, storage-only columns dropped.
    return prospectRowToDomain(this.vault, row) as unknown as ProspectRecord;
  }
}
