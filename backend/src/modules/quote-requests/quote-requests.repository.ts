import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { QuoteRequestRecord } from "./quote-submission.service";

export const QUOTE_REQUESTS_REPOSITORY = Symbol("QUOTE_REQUESTS_REPOSITORY");

export interface QuoteRequestsRepository extends RuntimeRepository {
  create(quote: QuoteRequestRecord): Promise<QuoteRequestRecord>;
  update(id: string, update: Partial<QuoteRequestRecord>): Promise<QuoteRequestRecord>;
  findByPublicReference(publicReference: string): Promise<QuoteRequestRecord | undefined>;
  list(): Promise<QuoteRequestRecord[]>;
}

export class MemoryQuoteRequestsRepository implements QuoteRequestsRepository {
  readonly mode = "memory-test" as const;
  private readonly requests: QuoteRequestRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "QuoteRequestsRepository");
  }

  async create(quote: QuoteRequestRecord): Promise<QuoteRequestRecord> {
    this.requests.push(quote);
    return quote;
  }

  async update(id: string, update: Partial<QuoteRequestRecord>): Promise<QuoteRequestRecord> {
    const quote = this.requests.find((candidate) => candidate.id === id);
    if (!quote) throw new Error(`Quote request ${id} not found`);
    Object.assign(quote, update);
    return quote;
  }

  async findByPublicReference(publicReference: string): Promise<QuoteRequestRecord | undefined> {
    return this.requests.find((candidate) => candidate.publicReference === publicReference);
  }

  async list(): Promise<QuoteRequestRecord[]> {
    return [...this.requests];
  }
}

type QuoteRequestDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaQuoteRequestsRepository implements QuoteRequestsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(quote: QuoteRequestRecord): Promise<QuoteRequestRecord> {
    return this.toDomain(await this.client().create({ data: this.toPrisma(quote) }));
  }

  async update(id: string, update: Partial<QuoteRequestRecord>): Promise<QuoteRequestRecord> {
    const data = this.toPrismaUpdate(update);
    return this.toDomain(await this.client().update({ where: { id }, data }));
  }

  async findByPublicReference(publicReference: string): Promise<QuoteRequestRecord | undefined> {
    const row = await this.client().findUnique({ where: { publicReference } });
    return row ? this.toDomain(row) : undefined;
  }

  async list(): Promise<QuoteRequestRecord[]> {
    return (await this.client().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDomain(row));
  }

  private client(): QuoteRequestDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { quoteRequest: QuoteRequestDelegate }).quoteRequest;
  }

  private toPrisma(quote: QuoteRequestRecord): Record<string, unknown> {
    const data = { ...quote } as Record<string, unknown>;
    delete data.countryCode;
    delete data.productKey;
    return data;
  }

  private toPrismaUpdate(update: Partial<QuoteRequestRecord>): Record<string, unknown> {
    const data = this.toPrisma(update as QuoteRequestRecord);
    delete data.id;
    delete data.createdAt;
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private toDomain(row: unknown): QuoteRequestRecord {
    return row as QuoteRequestRecord;
  }
}
