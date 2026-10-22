import type { BillingPlanKey } from "../../../../packages/shared/contracts/billing.contracts";
import type { PlanChangeRequestStatus } from "../../../../packages/shared/contracts/billing-plan-change.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

/** Lot 5 (spec 071) G-06: a plan change requested by a broker owner and decided by an admin. */
export interface PlanChangeRequestRecord {
  id: string;
  partnerTenantId: string;
  currentPlan: BillingPlanKey;
  requestedPlan: BillingPlanKey;
  status: PlanChangeRequestStatus;
  justification: string;
  requestedById: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  /** First day (UTC) of the cycle the accepted change applies from. */
  effectiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanChangeRequestFilter {
  status?: PlanChangeRequestStatus | undefined;
  partnerId?: string | undefined;
}

export type PlanChangeRequestDecision = Pick<PlanChangeRequestRecord, "status" | "decidedById" | "decidedAt" | "decisionReason" | "effectiveAt">;

export interface PlanChangeRequestsRepository extends RuntimeRepository {
  /** Throws an error with `code: "P2002"` when the partner already has a pending request. */
  create(record: PlanChangeRequestRecord): Promise<PlanChangeRequestRecord>;
  find(id: string): Promise<PlanChangeRequestRecord | undefined>;
  findPendingForPartner(partnerId: string): Promise<PlanChangeRequestRecord | undefined>;
  /** Newest first. */
  listForPartner(partnerId: string): Promise<PlanChangeRequestRecord[]>;
  /** Newest first. */
  listAll(filter?: PlanChangeRequestFilter): Promise<PlanChangeRequestRecord[]>;
  /** Closes a pending request; undefined when it is no longer pending (another decision won the race). */
  decide(id: string, decision: PlanChangeRequestDecision): Promise<PlanChangeRequestRecord | undefined>;
}

function matches(record: PlanChangeRequestRecord, filter: PlanChangeRequestFilter): boolean {
  return (!filter.status || record.status === filter.status) && (!filter.partnerId || record.partnerTenantId === filter.partnerId);
}

function byNewest(left: PlanChangeRequestRecord, right: PlanChangeRequestRecord): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

export class MemoryPlanChangeRequestsRepository implements PlanChangeRequestsRepository {
  readonly mode = "memory-test" as const;
  private readonly records = new Map<string, PlanChangeRequestRecord>();

  constructor() {
    assertRuntimeRepository(this.mode, "PlanChangeRequestsRepository");
  }

  async create(record: PlanChangeRequestRecord): Promise<PlanChangeRequestRecord> {
    // Same guarantee as the partial unique index: one pending request per partner.
    if (record.status === "pending" && (await this.findPendingForPartner(record.partnerTenantId))) {
      throw Object.assign(new Error("Unique constraint failed on pending plan change request"), { code: "P2002" });
    }
    this.records.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async find(id: string): Promise<PlanChangeRequestRecord | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async findPendingForPartner(partnerId: string): Promise<PlanChangeRequestRecord | undefined> {
    const record = [...this.records.values()].find((candidate) => candidate.partnerTenantId === partnerId && candidate.status === "pending");
    return record ? structuredClone(record) : undefined;
  }

  async listForPartner(partnerId: string): Promise<PlanChangeRequestRecord[]> {
    return this.listAll({ partnerId });
  }

  async listAll(filter: PlanChangeRequestFilter = {}): Promise<PlanChangeRequestRecord[]> {
    return [...this.records.values()].filter((record) => matches(record, filter)).sort(byNewest).map((record) => structuredClone(record));
  }

  async decide(id: string, decision: PlanChangeRequestDecision): Promise<PlanChangeRequestRecord | undefined> {
    const record = this.records.get(id);
    if (!record || record.status !== "pending") return undefined;
    Object.assign(record, decision, { updatedAt: new Date() });
    return structuredClone(record);
  }
}

type RequestDelegate = {
  create(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input: unknown): Promise<unknown[]>;
  updateMany(input: unknown): Promise<{ count: number }>;
};

export class PrismaPlanChangeRequestsRepository implements PlanChangeRequestsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: PlanChangeRequestRecord): Promise<PlanChangeRequestRecord> {
    return this.toDomain(await this.requests().create({ data: { ...record } }));
  }

  async find(id: string): Promise<PlanChangeRequestRecord | undefined> {
    const row = await this.requests().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async findPendingForPartner(partnerId: string): Promise<PlanChangeRequestRecord | undefined> {
    const row = await this.requests().findFirst({ where: { partnerTenantId: partnerId, status: "pending" } });
    return row ? this.toDomain(row) : undefined;
  }

  async listForPartner(partnerId: string): Promise<PlanChangeRequestRecord[]> {
    return this.listAll({ partnerId });
  }

  async listAll(filter: PlanChangeRequestFilter = {}): Promise<PlanChangeRequestRecord[]> {
    const where = {
      ...(filter.partnerId ? { partnerTenantId: filter.partnerId } : {}),
      ...(filter.status ? { status: filter.status } : {})
    };
    return (await this.requests().findMany({ where, orderBy: { createdAt: "desc" }, take: 500 })).map((row) => this.toDomain(row));
  }

  async decide(id: string, decision: PlanChangeRequestDecision): Promise<PlanChangeRequestRecord | undefined> {
    // Conditional update: only a pending row is closed, so two concurrent decisions cannot both win.
    const result = await this.requests().updateMany({ where: { id, status: "pending" }, data: { ...decision, updatedAt: new Date() } });
    return result.count > 0 ? this.find(id) : undefined;
  }

  private requests(): RequestDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { planChangeRequest: RequestDelegate }).planChangeRequest;
  }

  private toDomain(row: unknown): PlanChangeRequestRecord {
    const record = row as PlanChangeRequestRecord;
    return {
      ...record,
      requestedById: record.requestedById ?? null,
      decidedById: record.decidedById ?? null,
      decidedAt: record.decidedAt ?? null,
      decisionReason: record.decisionReason ?? null,
      effectiveAt: record.effectiveAt ?? null
    };
  }
}

export const PLAN_CHANGE_REQUESTS_REPOSITORY = "PLAN_CHANGE_REQUESTS_REPOSITORY";
