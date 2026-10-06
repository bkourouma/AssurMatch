import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";

/** Spec 054 R1: a visitor access token, stored only as its SHA-256. */
export interface VisitorAccessTokenRecord {
  id: string;
  quoteRequestId: string;
  tokenHash: string;
  purpose: "tracking";
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
}

export interface VisitorAccessTokensRepository extends RuntimeRepository {
  create(record: VisitorAccessTokenRecord): Promise<VisitorAccessTokenRecord>;
  listForQuote(quoteRequestId: string): Promise<VisitorAccessTokenRecord[]>;
  update(id: string, update: Partial<Pick<VisitorAccessTokenRecord, "lastUsedAt" | "revokedAt">>): Promise<void>;
  revokeAllForQuote(quoteRequestId: string, revokedAt: Date): Promise<number>;
}

export class MemoryVisitorAccessTokensRepository implements VisitorAccessTokensRepository {
  readonly mode = "memory-test" as const;
  private readonly records: VisitorAccessTokenRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "VisitorAccessTokensRepository");
  }

  async create(record: VisitorAccessTokenRecord): Promise<VisitorAccessTokenRecord> {
    this.records.push({ ...record });
    return record;
  }

  async listForQuote(quoteRequestId: string): Promise<VisitorAccessTokenRecord[]> {
    return this.records.filter((record) => record.quoteRequestId === quoteRequestId).map((record) => ({ ...record }));
  }

  async update(id: string, update: Partial<Pick<VisitorAccessTokenRecord, "lastUsedAt" | "revokedAt">>): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record) Object.assign(record, update);
  }

  async revokeAllForQuote(quoteRequestId: string, revokedAt: Date): Promise<number> {
    let count = 0;
    for (const record of this.records) {
      if (record.quoteRequestId !== quoteRequestId || record.revokedAt) continue;
      record.revokedAt = revokedAt;
      count += 1;
    }
    return count;
  }
}

type VisitorAccessTokenDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  findMany(input?: unknown): Promise<unknown[]>;
};

export class PrismaVisitorAccessTokensRepository implements VisitorAccessTokensRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: VisitorAccessTokenRecord): Promise<VisitorAccessTokenRecord> {
    return (await this.client().create({ data: { ...record } })) as VisitorAccessTokenRecord;
  }

  async listForQuote(quoteRequestId: string): Promise<VisitorAccessTokenRecord[]> {
    return (await this.client().findMany({ where: { quoteRequestId }, orderBy: { issuedAt: "desc" } })) as VisitorAccessTokenRecord[];
  }

  async update(id: string, update: Partial<Pick<VisitorAccessTokenRecord, "lastUsedAt" | "revokedAt">>): Promise<void> {
    await this.client().update({ where: { id }, data: update });
  }

  async revokeAllForQuote(quoteRequestId: string, revokedAt: Date): Promise<number> {
    return (await this.client().updateMany({ where: { quoteRequestId, revokedAt: null }, data: { revokedAt } })).count;
  }

  private client(): VisitorAccessTokenDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { visitorAccessToken: VisitorAccessTokenDelegate }).visitorAccessToken;
  }
}
