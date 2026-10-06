import type { AccreditationDocumentStatus, AccreditationDocumentType, AccreditationScanStatus } from "../../../../packages/shared/contracts/partner.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

/** Spec 051 R5: a persisted accreditation document (metadata; the bytes live in the document storage). */
export interface AccreditationDocument {
  id: string;
  partnerTenantId: string;
  licenseId?: string;
  documentType: AccreditationDocumentType;
  storageKey: string;
  checksum: string;
  status: AccreditationDocumentStatus;
  /** YYYY-MM-DD */
  expirationDate?: string;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewReason?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  scanStatus: AccreditationScanStatus;
  scanEngine?: string;
  scannedAt?: Date;
  retentionUntil: Date;
  createdById?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccreditationDocumentsRepository extends RuntimeRepository {
  create(document: AccreditationDocument): Promise<AccreditationDocument>;
  update(id: string, update: Partial<AccreditationDocument>): Promise<AccreditationDocument>;
  find(id: string): Promise<AccreditationDocument | undefined>;
  listForPartner(partnerTenantId: string): Promise<AccreditationDocument[]>;
}

export class MemoryAccreditationDocumentsRepository implements AccreditationDocumentsRepository {
  readonly mode = "memory-test" as const;
  private readonly documents: AccreditationDocument[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "AccreditationDocumentsRepository");
  }

  async create(document: AccreditationDocument): Promise<AccreditationDocument> {
    this.documents.push({ ...document });
    return { ...document };
  }

  async update(id: string, update: Partial<AccreditationDocument>): Promise<AccreditationDocument> {
    const document = this.documents.find((candidate) => candidate.id === id);
    if (!document) throw new Error(`Document ${id} not found`);
    Object.assign(document, update);
    return { ...document };
  }

  async find(id: string): Promise<AccreditationDocument | undefined> {
    const document = this.documents.find((candidate) => candidate.id === id);
    return document ? { ...document } : undefined;
  }

  async listForPartner(partnerTenantId: string): Promise<AccreditationDocument[]> {
    return this.documents.filter((document) => document.partnerTenantId === partnerTenantId).map((document) => ({ ...document }));
  }
}

type DocumentDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findMany(input: unknown): Promise<unknown[]>;
};

export class PrismaAccreditationDocumentsRepository implements AccreditationDocumentsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(document: AccreditationDocument): Promise<AccreditationDocument> {
    return this.toDomain(await this.client().create({ data: this.toPrisma(document) }));
  }

  async update(id: string, update: Partial<AccreditationDocument>): Promise<AccreditationDocument> {
    const data = this.toPrisma(update);
    delete data.id;
    delete data.createdAt;
    return this.toDomain(await this.client().update({ where: { id }, data }));
  }

  async find(id: string): Promise<AccreditationDocument | undefined> {
    const row = await this.client().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async listForPartner(partnerTenantId: string): Promise<AccreditationDocument[]> {
    return (await this.client().findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })).map((row) => this.toDomain(row));
  }

  private client(): DocumentDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { accreditationDocument: DocumentDelegate }).accreditationDocument;
  }

  private toPrisma(document: Partial<AccreditationDocument>): Record<string, unknown> {
    const data = { ...document } as Record<string, unknown>;
    if (typeof document.expirationDate === "string") data.expirationDate = new Date(`${document.expirationDate}T00:00:00.000Z`);
    return data;
  }

  private toDomain(row: unknown): AccreditationDocument {
    const record = { ...(row as Record<string, unknown>) };
    for (const [key, value] of Object.entries(record)) if (value === null) delete record[key];
    if (record.expirationDate instanceof Date) record.expirationDate = record.expirationDate.toISOString().slice(0, 10);
    return record as unknown as AccreditationDocument;
  }
}
