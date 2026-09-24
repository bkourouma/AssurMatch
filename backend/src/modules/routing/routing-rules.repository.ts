import type { RoutingRuleMode, RoutingRulePriority, RoutingRuleStatus } from "../../../../packages/shared/contracts/routing-rule.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface RoutingRuleRecord {
  id: string;
  countryId: string;
  productId: string | null;
  mode: RoutingRuleMode;
  /** Spec 042: upper bound on recipients when `mode === "multi_send"`; ignored otherwise. */
  maxRecipients: number;
  status: RoutingRuleStatus;
  priorities: RoutingRulePriority[];
  exclusivePartnerTenantId: string | null;
  description: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
}

export interface RoutingRuleHistoryRecord {
  id: string;
  routingRuleId: string;
  changeType: "created" | "updated";
  previousValue: unknown;
  nextValue: unknown;
  reason: string;
  changedById: string | null;
  changedAt: Date;
}

export interface RoutingRulesRepository extends RuntimeRepository {
  create(record: RoutingRuleRecord, history: RoutingRuleHistoryRecord): Promise<RoutingRuleRecord>;
  update(id: string, update: Partial<RoutingRuleRecord>, history: RoutingRuleHistoryRecord): Promise<RoutingRuleRecord>;
  list(): Promise<RoutingRuleRecord[]>;
  require(id: string): Promise<RoutingRuleRecord>;
  findActive(countryId: string, productId: string | null): Promise<RoutingRuleRecord | undefined>;
  historyFor(routingRuleId: string): Promise<RoutingRuleHistoryRecord[]>;
}

export class MemoryRoutingRulesRepository implements RoutingRulesRepository {
  readonly mode = "memory-test" as const;
  private readonly rules: RoutingRuleRecord[] = [];
  private readonly history: RoutingRuleHistoryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "RoutingRulesRepository");
  }

  async create(record: RoutingRuleRecord, history: RoutingRuleHistoryRecord): Promise<RoutingRuleRecord> {
    this.rules.push(record);
    this.history.push(history);
    return record;
  }

  async update(id: string, update: Partial<RoutingRuleRecord>, history: RoutingRuleHistoryRecord): Promise<RoutingRuleRecord> {
    const record = await this.require(id);
    Object.assign(record, update);
    this.history.push(history);
    return record;
  }

  async list(): Promise<RoutingRuleRecord[]> {
    return [...this.rules].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async require(id: string): Promise<RoutingRuleRecord> {
    const record = this.rules.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Routing rule ${id} not found`);
    return record;
  }

  async findActive(countryId: string, productId: string | null): Promise<RoutingRuleRecord | undefined> {
    return this.rules.find((rule) => rule.status === "active" && rule.countryId === countryId && (rule.productId ?? null) === productId);
  }

  async historyFor(routingRuleId: string): Promise<RoutingRuleHistoryRecord[]> {
    return this.history
      .filter((entry) => entry.routingRuleId === routingRuleId)
      .sort((left, right) => right.changedAt.getTime() - left.changedAt.getTime());
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
};

export class PrismaRoutingRulesRepository implements RoutingRulesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: RoutingRuleRecord, history: RoutingRuleHistoryRecord): Promise<RoutingRuleRecord> {
    const created = this.toRule(await this.rules().create({ data: this.toPrisma(record) }));
    await this.histories().create({ data: this.toPrismaHistory(history) });
    return created;
  }

  async update(id: string, update: Partial<RoutingRuleRecord>, history: RoutingRuleHistoryRecord): Promise<RoutingRuleRecord> {
    const data = Object.fromEntries(Object.entries(this.toPrisma(update as RoutingRuleRecord)).filter(([, value]) => value !== undefined));
    const updated = this.toRule(await this.rules().update({ where: { id }, data }));
    await this.histories().create({ data: this.toPrismaHistory(history) });
    return updated;
  }

  async list(): Promise<RoutingRuleRecord[]> {
    return (await this.rules().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toRule(row));
  }

  async require(id: string): Promise<RoutingRuleRecord> {
    const row = await this.rules().findUnique({ where: { id } });
    if (!row) throw new Error(`Routing rule ${id} not found`);
    return this.toRule(row);
  }

  async findActive(countryId: string, productId: string | null): Promise<RoutingRuleRecord | undefined> {
    const row = await this.rules().findFirst({ where: { countryId, productId, status: "active" } });
    return row ? this.toRule(row) : undefined;
  }

  async historyFor(routingRuleId: string): Promise<RoutingRuleHistoryRecord[]> {
    return (await this.histories().findMany({ where: { routingRuleId }, orderBy: { changedAt: "desc" } })).map((row) => row as RoutingRuleHistoryRecord);
  }

  private rules(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { routingRule: Delegate }).routingRule;
  }

  private histories(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { routingRuleHistory: Delegate }).routingRuleHistory;
  }

  private toPrisma(record: Partial<RoutingRuleRecord>): Record<string, unknown> {
    return { ...record, ...(record.priorities ? { priorities: record.priorities } : {}) };
  }

  private toPrismaHistory(history: RoutingRuleHistoryRecord): Record<string, unknown> {
    return {
      ...history,
      previousValue: history.previousValue ?? null,
      nextValue: history.nextValue ?? null
    };
  }

  private toRule(row: unknown): RoutingRuleRecord {
    const record = row as RoutingRuleRecord & { priorities: unknown };
    return { ...record, priorities: Array.isArray(record.priorities) ? record.priorities as RoutingRulePriority[] : [] };
  }
}
