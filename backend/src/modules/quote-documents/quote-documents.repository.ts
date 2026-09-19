import type { QuoteDocumentKind, QuoteDocumentScanStatus, QuoteDocumentStatus } from "../../../../packages/shared/contracts/quote-document.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface QuoteDocumentRecord {
  id: string;
  quoteRequestId: string;
  prospectId: string | null;
  label: string;
  documentKind: QuoteDocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
  scanStatus: QuoteDocumentScanStatus;
  scanEngine: string | null;
  scanSignature: string | null;
  scannedAt: Date | null;
  status: QuoteDocumentStatus;
  sharedLeadAssignmentId: string | null;
  sharedAt: Date | null;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteDocumentsRepository extends RuntimeRepository {
  create(record: QuoteDocumentRecord): Promise<QuoteDocumentRecord>;
  update(id: string, update: Partial<QuoteDocumentRecord>): Promise<QuoteDocumentRecord>;
  require(id: string): Promise<QuoteDocumentRecord>;
  listForQuote(quoteRequestId: string): Promise<QuoteDocumentRecord[]>;
  listPendingScans(limit: number): Promise<QuoteDocumentRecord[]>;
}

export class MemoryQuoteDocumentsRepository implements QuoteDocumentsRepository {
  readonly mode = "memory-test" as const;
  private readonly documents: QuoteDocumentRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "QuoteDocumentsRepository");
  }

  async create(record: QuoteDocumentRecord): Promise<QuoteDocumentRecord> {
    this.documents.push(record);
    return record;
  }

  async update(id: string, update: Partial<QuoteDocumentRecord>): Promise<QuoteDocumentRecord> {
    const record = await this.require(id);
    Object.assign(record, update);
    return record;
  }

  async require(id: string): Promise<QuoteDocumentRecord> {
    const record = this.documents.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Quote document ${id} not found`);
    return record;
  }

  async listForQuote(quoteRequestId: string): Promise<QuoteDocumentRecord[]> {
    return this.documents.filter((document) => document.quoteRequestId === quoteRequestId).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async listPendingScans(limit: number): Promise<QuoteDocumentRecord[]> {
    return this.documents.filter((document) => document.scanStatus === "pending").slice(0, limit);
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaQuoteDocumentsRepository implements QuoteDocumentsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: QuoteDocumentRecord): Promise<QuoteDocumentRecord> {
    return this.toRecord(await this.delegate().create({ data: record }));
  }

  async update(id: string, update: Partial<QuoteDocumentRecord>): Promise<QuoteDocumentRecord> {
    const data = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    return this.toRecord(await this.delegate().update({ where: { id }, data }));
  }

  async require(id: string): Promise<QuoteDocumentRecord> {
    const row = await this.delegate().findUnique({ where: { id } });
    if (!row) throw new Error(`Quote document ${id} not found`);
    return this.toRecord(row);
  }

  async listForQuote(quoteRequestId: string): Promise<QuoteDocumentRecord[]> {
    return (await this.delegate().findMany({ where: { quoteRequestId }, orderBy: { createdAt: "asc" } })).map((row) => this.toRecord(row));
  }

  async listPendingScans(limit: number): Promise<QuoteDocumentRecord[]> {
    return (await this.delegate().findMany({ where: { scanStatus: "pending" }, orderBy: { createdAt: "asc" }, take: limit })).map((row) => this.toRecord(row));
  }

  private delegate(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { quoteRequestDocument: Delegate }).quoteRequestDocument;
  }

  private toRecord(row: unknown): QuoteDocumentRecord {
    return row as QuoteDocumentRecord;
  }
}
