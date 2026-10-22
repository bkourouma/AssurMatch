import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RoutingDecisionRecord } from "./routing-decision.service";

export const ROUTING_DECISIONS_REPOSITORY = Symbol("ROUTING_DECISIONS_REPOSITORY");

export interface RoutingDecisionsRepository extends RuntimeRepository {
  create(decision: RoutingDecisionRecord): Promise<RoutingDecisionRecord>;
  list(): Promise<RoutingDecisionRecord[]>;
  /** Lot 5 (spec 071): newest decision of one quote request. */
  latestForQuote(quoteRequestId: string): Promise<RoutingDecisionRecord | undefined>;
}

export class MemoryRoutingDecisionsRepository implements RoutingDecisionsRepository {
  readonly mode = "memory-test" as const;
  private readonly decisions: RoutingDecisionRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "RoutingDecisionsRepository");
  }

  async create(decision: RoutingDecisionRecord): Promise<RoutingDecisionRecord> {
    this.decisions.push(decision);
    return decision;
  }

  async list(): Promise<RoutingDecisionRecord[]> {
    return [...this.decisions];
  }

  async latestForQuote(quoteRequestId: string): Promise<RoutingDecisionRecord | undefined> {
    // Insertion order breaks ties between decisions recorded in the same millisecond.
    return this.decisions
      .filter((decision) => decision.quoteRequestId === quoteRequestId)
      .reduce<RoutingDecisionRecord | undefined>((latest, decision) => !latest || decision.createdAt >= latest.createdAt ? decision : latest, undefined);
  }
}

type RoutingDecisionDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input?: unknown): Promise<unknown | null>;
};

export class PrismaRoutingDecisionsRepository implements RoutingDecisionsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(decision: RoutingDecisionRecord): Promise<RoutingDecisionRecord> {
    return this.toDomain(await this.client().create({ data: { ...decision } }));
  }

  async list(): Promise<RoutingDecisionRecord[]> {
    return (await this.client().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDomain(row));
  }

  async latestForQuote(quoteRequestId: string): Promise<RoutingDecisionRecord | undefined> {
    const row = await this.client().findFirst({ where: { quoteRequestId }, orderBy: { createdAt: "desc" } });
    return row ? this.toDomain(row) : undefined;
  }

  private client(): RoutingDecisionDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { routingDecision: RoutingDecisionDelegate }).routingDecision;
  }

  private toDomain(row: unknown): RoutingDecisionRecord {
    const record = row as RoutingDecisionRecord & { controlDetails?: unknown };
    // Lot 5 (spec 071): `controlDetails` is a nullable JSON column; absent details stay undefined.
    if (record.controlDetails === null || typeof record.controlDetails !== "object") {
      const rest = { ...record };
      delete rest.controlDetails;
      return rest as RoutingDecisionRecord;
    }
    return record as RoutingDecisionRecord;
  }
}
