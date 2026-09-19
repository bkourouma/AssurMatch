import type { AiAssistTypeCatalog, AiHumanValidationStatus, AiInteractionStatus, AiSurface } from "../../../../../packages/shared/contracts/ai.contracts";
import type { PrismaService } from "../../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../../common/repositories/runtime-repository";

export interface AiInteractionRecord {
  id: string;
  moduleConfigId: string;
  actorId: string | null;
  scope: Record<string, unknown>;
  minimizedInputReference: string;
  outputReference: string;
  guardrailResult: string;
  humanValidationStatus: AiHumanValidationStatus;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  assistType: AiAssistTypeCatalog;
  surface: AiSurface;
  status: AiInteractionStatus;
  provider: string;
  model: string | null;
  fallback: boolean;
  promptHash: string | null;
  outputHash: string | null;
  outputText: string | null;
  outputData: unknown;
  refusalReason: string | null;
  minimizationReport: Record<string, unknown> | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  targetType: string | null;
  targetId: string | null;
  partnerTenantId: string | null;
  countryId: string | null;
  productId: string | null;
  correlationId: string | null;
  completedAt: Date | null;
}

export interface AiInteractionsRepository extends RuntimeRepository {
  create(record: AiInteractionRecord): Promise<AiInteractionRecord>;
  update(id: string, update: Partial<AiInteractionRecord>): Promise<AiInteractionRecord>;
  find(id: string): Promise<AiInteractionRecord | undefined>;
  listQueued(limit: number): Promise<AiInteractionRecord[]>;
  listForTarget(targetType: string, targetId: string): Promise<AiInteractionRecord[]>;
  listForSurface(surface: AiSurface, limit: number): Promise<AiInteractionRecord[]>;
  countSince(filter: { surface?: AiSurface; partnerTenantId?: string; actorId?: string; since: Date }): Promise<number>;
}

export class MemoryAiInteractionsRepository implements AiInteractionsRepository {
  readonly mode = "memory-test" as const;
  private readonly records: AiInteractionRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "AiInteractionsRepository");
  }

  async create(record: AiInteractionRecord): Promise<AiInteractionRecord> {
    this.records.push(record);
    return record;
  }

  async update(id: string, update: Partial<AiInteractionRecord>): Promise<AiInteractionRecord> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`AI interaction ${id} not found`);
    Object.assign(record, update);
    return record;
  }

  async find(id: string): Promise<AiInteractionRecord | undefined> {
    return this.records.find((candidate) => candidate.id === id);
  }

  async listQueued(limit: number): Promise<AiInteractionRecord[]> {
    return this.records.filter((record) => record.status === "queued").slice(0, limit);
  }

  async listForTarget(targetType: string, targetId: string): Promise<AiInteractionRecord[]> {
    return this.records.filter((record) => record.targetType === targetType && record.targetId === targetId).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async listForSurface(surface: AiSurface, limit: number): Promise<AiInteractionRecord[]> {
    return this.records.filter((record) => record.surface === surface).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, limit);
  }

  async countSince(filter: { surface?: AiSurface; partnerTenantId?: string; actorId?: string; since: Date }): Promise<number> {
    return this.records.filter((record) =>
      record.createdAt >= filter.since
      && (!filter.surface || record.surface === filter.surface)
      && (!filter.partnerTenantId || record.partnerTenantId === filter.partnerTenantId)
      && (!filter.actorId || record.actorId === filter.actorId)
    ).length;
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  count(input?: unknown): Promise<number>;
};

export class PrismaAiInteractionsRepository implements AiInteractionsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: AiInteractionRecord): Promise<AiInteractionRecord> {
    return this.toRecord(await this.delegate().create({ data: this.clean(record) }));
  }

  async update(id: string, update: Partial<AiInteractionRecord>): Promise<AiInteractionRecord> {
    return this.toRecord(await this.delegate().update({ where: { id }, data: this.clean(update) }));
  }

  async find(id: string): Promise<AiInteractionRecord | undefined> {
    const row = await this.delegate().findUnique({ where: { id } });
    return row ? this.toRecord(row) : undefined;
  }

  async listQueued(limit: number): Promise<AiInteractionRecord[]> {
    return (await this.delegate().findMany({ where: { status: "queued" }, orderBy: { createdAt: "asc" }, take: limit })).map((row) => this.toRecord(row));
  }

  async listForTarget(targetType: string, targetId: string): Promise<AiInteractionRecord[]> {
    return (await this.delegate().findMany({ where: { targetType, targetId }, orderBy: { createdAt: "desc" } })).map((row) => this.toRecord(row));
  }

  async listForSurface(surface: AiSurface, limit: number): Promise<AiInteractionRecord[]> {
    return (await this.delegate().findMany({ where: { surface }, orderBy: { createdAt: "desc" }, take: limit })).map((row) => this.toRecord(row));
  }

  async countSince(filter: { surface?: AiSurface; partnerTenantId?: string; actorId?: string; since: Date }): Promise<number> {
    return this.delegate().count({
      where: {
        createdAt: { gte: filter.since },
        ...(filter.surface ? { surface: filter.surface } : {}),
        ...(filter.partnerTenantId ? { partnerTenantId: filter.partnerTenantId } : {}),
        ...(filter.actorId ? { actorId: filter.actorId } : {})
      }
    });
  }

  private delegate(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { aIInteraction: Delegate }).aIInteraction;
  }

  private clean(value: Partial<AiInteractionRecord>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
  }

  private toRecord(row: unknown): AiInteractionRecord {
    return row as AiInteractionRecord;
  }
}
