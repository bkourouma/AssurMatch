import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { RegulatoryRegime } from "./regulatory-regimes.module";

export interface RegulatoryRegimesRepository extends RuntimeRepository {
  create(regime: RegulatoryRegime): Promise<RegulatoryRegime>;
  update(id: string, update: Partial<RegulatoryRegime>): Promise<RegulatoryRegime>;
  list(): Promise<RegulatoryRegime[]>;
  findById(id: string): Promise<RegulatoryRegime | undefined>;
  findByKey(key: string): Promise<RegulatoryRegime | undefined>;
}

export class MemoryRegulatoryRegimesRepository implements RegulatoryRegimesRepository {
  readonly mode = "memory-test" as const;
  private readonly regimes: RegulatoryRegime[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "RegulatoryRegimesRepository");
  }

  async create(regime: RegulatoryRegime): Promise<RegulatoryRegime> {
    this.regimes.push(regime);
    return regime;
  }

  async update(id: string, update: Partial<RegulatoryRegime>): Promise<RegulatoryRegime> {
    const regime = this.regimes.find((candidate) => candidate.id === id);
    if (!regime) throw new Error(`Regulatory regime ${id} not found`);
    Object.assign(regime, update);
    return regime;
  }

  async list(): Promise<RegulatoryRegime[]> {
    return [...this.regimes];
  }

  async findById(id: string): Promise<RegulatoryRegime | undefined> {
    return this.regimes.find((candidate) => candidate.id === id);
  }

  async findByKey(key: string): Promise<RegulatoryRegime | undefined> {
    return this.regimes.find((candidate) => candidate.key === key);
  }
}

type RegulatoryRegimeDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type RegulatoryRegimeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  retentionOverrideYears: number | null;
  requiresManualActivationReview: boolean;
  status: RegulatoryRegime["status"];
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
};

/** Spec 050 R9: regimes used to live in memory only although the Prisma model existed. */
export class PrismaRegulatoryRegimesRepository implements RegulatoryRegimesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(regime: RegulatoryRegime): Promise<RegulatoryRegime> {
    return this.toDomain(await this.client().create({ data: this.toPrisma(regime) }));
  }

  async update(id: string, update: Partial<RegulatoryRegime>): Promise<RegulatoryRegime> {
    const data = this.toPrisma(update);
    delete data.id;
    delete data.createdAt;
    delete data.key;
    return this.toDomain(await this.client().update({
      where: { id },
      data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    }));
  }

  async list(): Promise<RegulatoryRegime[]> {
    return (await this.client().findMany({ orderBy: { key: "asc" } })).map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<RegulatoryRegime | undefined> {
    const row = await this.client().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async findByKey(key: string): Promise<RegulatoryRegime | undefined> {
    const row = await this.client().findUnique({ where: { key } });
    return row ? this.toDomain(row) : undefined;
  }

  private client(): RegulatoryRegimeDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { regulatoryRegime: RegulatoryRegimeDelegate }).regulatoryRegime;
  }

  private toPrisma(regime: Partial<RegulatoryRegime>): Record<string, unknown> {
    return {
      id: regime.id,
      key: regime.key,
      name: regime.name,
      description: regime.description,
      retentionOverrideYears: regime.retentionOverrideYears,
      requiresManualActivationReview: regime.requiresManualActivationReview,
      status: regime.status,
      createdAt: regime.createdAt,
      updatedAt: regime.updatedAt,
      createdById: regime.createdById
    };
  }

  private toDomain(row: unknown): RegulatoryRegime {
    const item = row as RegulatoryRegimeRow;
    return {
      id: item.id,
      key: item.key,
      name: item.name,
      ...(item.description !== null ? { description: item.description } : {}),
      ...(item.retentionOverrideYears !== null ? { retentionOverrideYears: item.retentionOverrideYears } : {}),
      requiresManualActivationReview: item.requiresManualActivationReview,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...(item.createdById ? { createdById: item.createdById } : {})
    };
  }
}
