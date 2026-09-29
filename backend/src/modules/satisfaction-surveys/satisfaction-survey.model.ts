import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";

export type SatisfactionSurveyStatus = "queued" | "sent" | "submitted" | "skipped" | "expired";

export interface SatisfactionSurveyRecord {
  id: string;
  publicReference: string;
  tokenHash: string;
  leadAssignmentId: string;
  quoteRequestId: string;
  partnerTenantId: string;
  consentRecordId: string;
  triggerStatus: string;
  status: SatisfactionSurveyStatus;
  skippedReason?: string | null;
  dueAt: Date;
  sentAt?: Date | null;
  expiresAt?: Date | null;
  submittedAt?: Date | null;
  rating?: number | null;
  comment?: string | null;
  flaggedConcern: boolean;
  anonymizedAt?: Date | null;
  retentionUntil?: Date | null;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateSatisfactionSurveyInput = Omit<SatisfactionSurveyRecord, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpdateSatisfactionSurveyInput = Partial<Omit<SatisfactionSurveyRecord, "id" | "createdAt">> & {
  updatedAt?: Date;
};

export interface SatisfactionSurveyRepository extends RuntimeRepository {
  create(input: CreateSatisfactionSurveyInput): Promise<SatisfactionSurveyRecord>;
  update(id: string, update: UpdateSatisfactionSurveyInput): Promise<SatisfactionSurveyRecord>;
  findById(id: string): Promise<SatisfactionSurveyRecord | undefined>;
  findByPublicReference(publicReference: string): Promise<SatisfactionSurveyRecord | undefined>;
  findByLeadAssignmentId(leadAssignmentId: string): Promise<SatisfactionSurveyRecord | undefined>;
  findByQuoteRequestId(quoteRequestId: string): Promise<SatisfactionSurveyRecord[]>;
  findByPartnerTenantId(partnerTenantId: string): Promise<SatisfactionSurveyRecord[]>;
  findDueQueued(now: Date, limit: number): Promise<SatisfactionSurveyRecord[]>;
  listAll(): Promise<SatisfactionSurveyRecord[]>;
}

export class MemorySatisfactionSurveyRepository implements SatisfactionSurveyRepository {
  readonly mode = "memory-test" as const;
  private readonly records: SatisfactionSurveyRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "SatisfactionSurveyRepository");
  }

  async create(input: CreateSatisfactionSurveyInput): Promise<SatisfactionSurveyRecord> {
    const now = new Date();
    const record: SatisfactionSurveyRecord = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now
    };
    this.records.push(record);
    return record;
  }

  async update(id: string, update: UpdateSatisfactionSurveyInput): Promise<SatisfactionSurveyRecord> {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error(`SatisfactionSurveyRecord ${id} not found`);
    Object.assign(record, update, { updatedAt: update.updatedAt ?? new Date() });
    return record;
  }

  async findById(id: string): Promise<SatisfactionSurveyRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async findByPublicReference(publicReference: string): Promise<SatisfactionSurveyRecord | undefined> {
    return this.records.find((r) => r.publicReference === publicReference);
  }

  async findByLeadAssignmentId(leadAssignmentId: string): Promise<SatisfactionSurveyRecord | undefined> {
    return this.records.find((r) => r.leadAssignmentId === leadAssignmentId);
  }

  async findByQuoteRequestId(quoteRequestId: string): Promise<SatisfactionSurveyRecord[]> {
    return this.records.filter((r) => r.quoteRequestId === quoteRequestId);
  }

  async findByPartnerTenantId(partnerTenantId: string): Promise<SatisfactionSurveyRecord[]> {
    return this.records.filter((r) => r.partnerTenantId === partnerTenantId);
  }

  async findDueQueued(now: Date, limit: number): Promise<SatisfactionSurveyRecord[]> {
    return this.records
      .filter((r) => r.status === "queued" && r.dueAt <= now)
      .slice(0, limit);
  }

  async listAll(): Promise<SatisfactionSurveyRecord[]> {
    return [...this.records];
  }
}

type SurveyDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
};

export class PrismaSatisfactionSurveyRepository implements SatisfactionSurveyRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSatisfactionSurveyInput): Promise<SatisfactionSurveyRecord> {
    const row = await this.client().create({ data: input });
    return this.toDomain(row);
  }

  async update(id: string, update: UpdateSatisfactionSurveyInput): Promise<SatisfactionSurveyRecord> {
    const row = await this.client().update({ where: { id }, data: update });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<SatisfactionSurveyRecord | undefined> {
    const row = await this.client().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async findByPublicReference(publicReference: string): Promise<SatisfactionSurveyRecord | undefined> {
    const row = await this.client().findUnique({ where: { publicReference } });
    return row ? this.toDomain(row) : undefined;
  }

  async findByLeadAssignmentId(leadAssignmentId: string): Promise<SatisfactionSurveyRecord | undefined> {
    const row = await this.client().findUnique({ where: { leadAssignmentId } });
    return row ? this.toDomain(row) : undefined;
  }

  async findByQuoteRequestId(quoteRequestId: string): Promise<SatisfactionSurveyRecord[]> {
    const rows = await this.client().findMany({ where: { quoteRequestId }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => this.toDomain(r));
  }

  async findByPartnerTenantId(partnerTenantId: string): Promise<SatisfactionSurveyRecord[]> {
    const rows = await this.client().findMany({ where: { partnerTenantId }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => this.toDomain(r));
  }

  async findDueQueued(now: Date, limit: number): Promise<SatisfactionSurveyRecord[]> {
    const rows = await this.client().findMany({
      where: { status: "queued", dueAt: { lte: now } },
      orderBy: { dueAt: "asc" },
      take: limit
    });
    return rows.map((r) => this.toDomain(r));
  }

  async listAll(): Promise<SatisfactionSurveyRecord[]> {
    const rows = await this.client().findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((r) => this.toDomain(r));
  }

  private client(): SurveyDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { satisfactionSurveyRequest: SurveyDelegate }).satisfactionSurveyRequest;
  }

  private toDomain(row: unknown): SatisfactionSurveyRecord {
    return row as SatisfactionSurveyRecord;
  }
}
