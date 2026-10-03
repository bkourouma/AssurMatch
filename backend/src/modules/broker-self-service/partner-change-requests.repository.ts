import type { PartnerChangeRequestStatus, PartnerChangeRequestType } from "../../../../packages/shared/contracts/broker-self-service.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";

/** Spec 053 R3: a broker request decided by the admin (identity change or coverage extension). */
export interface PartnerChangeRequestRecord {
  id: string;
  partnerTenantId: string;
  type: PartnerChangeRequestType;
  status: PartnerChangeRequestStatus;
  requestedChanges: Record<string, string>;
  previousValues: Record<string, string | null>;
  justification: string;
  requestedById: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerChangeRequestFilter {
  partnerTenantId?: string | undefined;
  status?: PartnerChangeRequestStatus | undefined;
  type?: PartnerChangeRequestType | undefined;
}

export type PartnerChangeRequestDecision = Pick<PartnerChangeRequestRecord, "status" | "decidedById" | "decidedAt" | "decisionReason">;

export interface PartnerChangeRequestsRepository {
  readonly mode: "memory-test" | "prisma-runtime";
  create(record: PartnerChangeRequestRecord): Promise<PartnerChangeRequestRecord>;
  find(id: string): Promise<PartnerChangeRequestRecord | undefined>;
  list(filter?: PartnerChangeRequestFilter): Promise<PartnerChangeRequestRecord[]>;
  /**
   * Closes a pending request. Resolves to undefined when the request is no longer pending (another
   * decision won the race), so a request is decided exactly once.
   */
  close(id: string, decision: PartnerChangeRequestDecision): Promise<PartnerChangeRequestRecord | undefined>;
}

function matches(record: PartnerChangeRequestRecord, filter: PartnerChangeRequestFilter): boolean {
  return (!filter.partnerTenantId || record.partnerTenantId === filter.partnerTenantId)
    && (!filter.status || record.status === filter.status)
    && (!filter.type || record.type === filter.type);
}

/** Newest first: the screens show the pending requests on top of the history. */
function byNewest(left: PartnerChangeRequestRecord, right: PartnerChangeRequestRecord): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

export class MemoryPartnerChangeRequestsRepository implements PartnerChangeRequestsRepository {
  readonly mode = "memory-test" as const;
  private readonly records = new Map<string, PartnerChangeRequestRecord>();

  async create(record: PartnerChangeRequestRecord): Promise<PartnerChangeRequestRecord> {
    this.records.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async find(id: string): Promise<PartnerChangeRequestRecord | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async list(filter: PartnerChangeRequestFilter = {}): Promise<PartnerChangeRequestRecord[]> {
    return [...this.records.values()].filter((record) => matches(record, filter)).sort(byNewest).map((record) => structuredClone(record));
  }

  async close(id: string, decision: PartnerChangeRequestDecision): Promise<PartnerChangeRequestRecord | undefined> {
    const record = this.records.get(id);
    if (!record || record.status !== "pending") return undefined;
    Object.assign(record, decision, { updatedAt: new Date() });
    return structuredClone(record);
  }
}

type RequestDelegate = {
  create(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findMany(input: unknown): Promise<unknown[]>;
  updateMany(input: unknown): Promise<{ count: number }>;
};

export class PrismaPartnerChangeRequestsRepository implements PartnerChangeRequestsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: PartnerChangeRequestRecord): Promise<PartnerChangeRequestRecord> {
    return this.toDomain(await this.requests().create({ data: { ...record } }));
  }

  async find(id: string): Promise<PartnerChangeRequestRecord | undefined> {
    const row = await this.requests().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async list(filter: PartnerChangeRequestFilter = {}): Promise<PartnerChangeRequestRecord[]> {
    const where = {
      ...(filter.partnerTenantId ? { partnerTenantId: filter.partnerTenantId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {})
    };
    return (await this.requests().findMany({ where, orderBy: { createdAt: "desc" }, take: 500 })).map((row) => this.toDomain(row));
  }

  async close(id: string, decision: PartnerChangeRequestDecision): Promise<PartnerChangeRequestRecord | undefined> {
    // Conditional update: only a pending row is closed, so two concurrent decisions cannot both win.
    const result = await this.requests().updateMany({ where: { id, status: "pending" }, data: { ...decision, updatedAt: new Date() } });
    return result.count > 0 ? this.find(id) : undefined;
  }

  private requests(): RequestDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerChangeRequest: RequestDelegate }).partnerChangeRequest;
  }

  private toDomain(row: unknown): PartnerChangeRequestRecord {
    const record = row as PartnerChangeRequestRecord;
    return {
      ...record,
      requestedChanges: (record.requestedChanges ?? {}) as Record<string, string>,
      previousValues: (record.previousValues ?? {}) as Record<string, string | null>,
      requestedById: record.requestedById ?? null,
      decidedById: record.decidedById ?? null,
      decidedAt: record.decidedAt ?? null,
      decisionReason: record.decisionReason ?? null
    };
  }
}
