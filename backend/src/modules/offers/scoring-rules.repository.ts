import type { ScoringRuleStatus, ScoringWeights } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface ScoringRuleRecord {
  id: string;
  countryId: string | null;
  productId: string | null;
  weights: ScoringWeights;
  status: ScoringRuleStatus;
  description: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
}

export interface ScoringRulesRepository extends RuntimeRepository {
  create(record: ScoringRuleRecord): Promise<ScoringRuleRecord>;
  update(id: string, update: Partial<ScoringRuleRecord>): Promise<ScoringRuleRecord>;
  list(): Promise<ScoringRuleRecord[]>;
  require(id: string): Promise<ScoringRuleRecord>;
  findActive(countryId: string | null, productId: string | null): Promise<ScoringRuleRecord | undefined>;
}

export class MemoryScoringRulesRepository implements ScoringRulesRepository {
  readonly mode = "memory-test" as const;
  private readonly rules: ScoringRuleRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ScoringRulesRepository");
  }

  async create(record: ScoringRuleRecord): Promise<ScoringRuleRecord> {
    this.rules.push(record);
    return record;
  }

  async update(id: string, update: Partial<ScoringRuleRecord>): Promise<ScoringRuleRecord> {
    const record = await this.require(id);
    Object.assign(record, update);
    return record;
  }

  async list(): Promise<ScoringRuleRecord[]> {
    return [...this.rules].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async require(id: string): Promise<ScoringRuleRecord> {
    const record = this.rules.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Scoring rule ${id} not found`);
    return record;
  }

  async findActive(countryId: string | null, productId: string | null): Promise<ScoringRuleRecord | undefined> {
    return this.rules.find((rule) => rule.status === "active" && rule.countryId === countryId && rule.productId === productId);
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
};

export class PrismaScoringRulesRepository implements ScoringRulesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: ScoringRuleRecord): Promise<ScoringRuleRecord> {
    return this.toRecord(await this.delegate().create({ data: record }));
  }

  async update(id: string, update: Partial<ScoringRuleRecord>): Promise<ScoringRuleRecord> {
    const data = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    return this.toRecord(await this.delegate().update({ where: { id }, data }));
  }

  async list(): Promise<ScoringRuleRecord[]> {
    return (await this.delegate().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toRecord(row));
  }

  async require(id: string): Promise<ScoringRuleRecord> {
    const row = await this.delegate().findUnique({ where: { id } });
    if (!row) throw new Error(`Scoring rule ${id} not found`);
    return this.toRecord(row);
  }

  async findActive(countryId: string | null, productId: string | null): Promise<ScoringRuleRecord | undefined> {
    const row = await this.delegate().findFirst({ where: { countryId, productId, status: "active" } });
    return row ? this.toRecord(row) : undefined;
  }

  private delegate(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { scoringRule: Delegate }).scoringRule;
  }

  private toRecord(row: unknown): ScoringRuleRecord {
    return row as ScoringRuleRecord;
  }
}
