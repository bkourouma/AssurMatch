import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RoutingDecisionRecord } from "./routing-decision.service";

export const ROUTING_DECISIONS_REPOSITORY = Symbol("ROUTING_DECISIONS_REPOSITORY");

export interface RoutingDecisionsRepository extends RuntimeRepository {
  create(decision: RoutingDecisionRecord): Promise<RoutingDecisionRecord>;
  list(): Promise<RoutingDecisionRecord[]>;
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
}

type RoutingDecisionDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
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

  private client(): RoutingDecisionDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { routingDecision: RoutingDecisionDelegate }).routingDecision;
  }

  private toDomain(row: unknown): RoutingDecisionRecord {
    return row as RoutingDecisionRecord;
  }
}
