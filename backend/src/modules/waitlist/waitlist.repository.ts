import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";

export const WAITLIST_REPOSITORY = Symbol("WAITLIST_REPOSITORY");

export type WaitlistEntryStatus = "active" | "unsubscribed" | "notified";

export interface WaitlistEntryRecord {
  id: string;
  countryId: string;
  productId?: string;
  emailNormalized: string;
  emailFingerprint: string;
  consentVersion: string;
  status: WaitlistEntryStatus;
  ipHash?: string;
  source: "public_web";
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WaitlistRepository extends RuntimeRepository {
  create(entry: WaitlistEntryRecord): Promise<WaitlistEntryRecord>;
  findByCountryAndFingerprint(countryId: string, fingerprint: string): Promise<WaitlistEntryRecord | null>;
  list(): Promise<WaitlistEntryRecord[]>;
}

export class MemoryWaitlistRepository implements WaitlistRepository {
  readonly mode = "memory-test" as const;
  private readonly entries: WaitlistEntryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "WaitlistRepository");
  }

  async create(entry: WaitlistEntryRecord): Promise<WaitlistEntryRecord> {
    this.entries.push(entry);
    return entry;
  }

  async findByCountryAndFingerprint(countryId: string, fingerprint: string): Promise<WaitlistEntryRecord | null> {
    return (
      this.entries.find(
        (candidate) => candidate.countryId === countryId && candidate.emailFingerprint === fingerprint
      ) ?? null
    );
  }

  async list(): Promise<WaitlistEntryRecord[]> {
    return [...this.entries];
  }
}

type WaitlistEntryDelegate = {
  create(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
};

export class PrismaWaitlistRepository implements WaitlistRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(entry: WaitlistEntryRecord): Promise<WaitlistEntryRecord> {
    return this.toDomain(await this.client().create({ data: this.toPrisma(entry) }));
  }

  async findByCountryAndFingerprint(countryId: string, fingerprint: string): Promise<WaitlistEntryRecord | null> {
    const row = await this.client().findUnique({
      where: { countryId_emailFingerprint: { countryId, emailFingerprint: fingerprint } }
    });
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<WaitlistEntryRecord[]> {
    return (await this.client().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDomain(row));
  }

  private client(): WaitlistEntryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { waitlistEntry: WaitlistEntryDelegate }).waitlistEntry;
  }

  private toPrisma(entry: WaitlistEntryRecord): Record<string, unknown> {
    return { ...entry } as Record<string, unknown>;
  }

  private toDomain(row: unknown): WaitlistEntryRecord {
    return row as WaitlistEntryRecord;
  }
}
