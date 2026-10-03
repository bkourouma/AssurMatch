import type { AdminAlertSeverity, AdminAlertStatus, AdminAlertType } from "../../../../packages/shared/contracts/admin-alerts.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface AdminAlertRecord {
  id: string;
  type: AdminAlertType;
  severity: AdminAlertSeverity;
  conditionKey: string;
  dedupeKey: string;
  targetType: string;
  targetId: string | null;
  countryId: string | null;
  partnerTenantId: string | null;
  details: Record<string, string | number | boolean>;
  status: AdminAlertStatus;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  acknowledgeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminAlertsRepository extends RuntimeRepository {
  findByDedupeKey(dedupeKey: string): Promise<AdminAlertRecord | undefined>;
  findOpenByCondition(conditionKey: string): Promise<AdminAlertRecord | undefined>;
  /** Throws a `P2002`-coded error when the dedupe key already exists. */
  create(record: AdminAlertRecord): Promise<AdminAlertRecord>;
  update(id: string, patch: Partial<AdminAlertRecord>): Promise<AdminAlertRecord>;
  find(id: string): Promise<AdminAlertRecord | undefined>;
  list(filter: { status?: AdminAlertStatus | undefined; type?: AdminAlertType | undefined; limit: number }): Promise<AdminAlertRecord[]>;
  countOpen(): Promise<number>;
}

export class MemoryAdminAlertsRepository implements AdminAlertsRepository {
  readonly mode = "memory-test" as const;
  private readonly alerts: AdminAlertRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "AdminAlertsRepository");
  }

  async findByDedupeKey(dedupeKey: string): Promise<AdminAlertRecord | undefined> {
    return this.alerts.find((alert) => alert.dedupeKey === dedupeKey);
  }

  async findOpenByCondition(conditionKey: string): Promise<AdminAlertRecord | undefined> {
    return this.alerts.find((alert) => alert.conditionKey === conditionKey && alert.status === "open");
  }

  async create(record: AdminAlertRecord): Promise<AdminAlertRecord> {
    if (this.alerts.some((alert) => alert.dedupeKey === record.dedupeKey)) throw Object.assign(new Error("Unique constraint failed on dedupeKey"), { code: "P2002" });
    this.alerts.push({ ...record });
    return { ...record };
  }

  async update(id: string, patch: Partial<AdminAlertRecord>): Promise<AdminAlertRecord> {
    const alert = this.alerts.find((candidate) => candidate.id === id);
    if (!alert) throw new Error(`Admin alert ${id} not found`);
    Object.assign(alert, patch);
    return { ...alert };
  }

  async find(id: string): Promise<AdminAlertRecord | undefined> {
    const alert = this.alerts.find((candidate) => candidate.id === id);
    return alert ? { ...alert } : undefined;
  }

  async list(filter: { status?: AdminAlertStatus | undefined; type?: AdminAlertType | undefined; limit: number }): Promise<AdminAlertRecord[]> {
    return this.alerts
      .filter((alert) => (!filter.status || alert.status === filter.status) && (!filter.type || alert.type === filter.type))
      .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
      .slice(0, filter.limit)
      .map((alert) => ({ ...alert }));
  }

  async countOpen(): Promise<number> {
    return this.alerts.filter((alert) => alert.status === "open").length;
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  count(input?: unknown): Promise<number>;
};

export class PrismaAdminAlertsRepository implements AdminAlertsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async findByDedupeKey(dedupeKey: string): Promise<AdminAlertRecord | undefined> {
    return (await this.client().findUnique({ where: { dedupeKey } }) ?? undefined) as AdminAlertRecord | undefined;
  }

  async findOpenByCondition(conditionKey: string): Promise<AdminAlertRecord | undefined> {
    return (await this.client().findFirst({ where: { conditionKey, status: "open" } }) ?? undefined) as AdminAlertRecord | undefined;
  }

  async create(record: AdminAlertRecord): Promise<AdminAlertRecord> {
    return await this.client().create({ data: record }) as AdminAlertRecord;
  }

  async update(id: string, patch: Partial<AdminAlertRecord>): Promise<AdminAlertRecord> {
    return await this.client().update({ where: { id }, data: patch }) as AdminAlertRecord;
  }

  async find(id: string): Promise<AdminAlertRecord | undefined> {
    return (await this.client().findUnique({ where: { id } }) ?? undefined) as AdminAlertRecord | undefined;
  }

  async list(filter: { status?: AdminAlertStatus | undefined; type?: AdminAlertType | undefined; limit: number }): Promise<AdminAlertRecord[]> {
    return await this.client().findMany({
      where: { ...(filter.status ? { status: filter.status } : {}), ...(filter.type ? { type: filter.type } : {}) },
      orderBy: { lastSeenAt: "desc" },
      take: filter.limit
    }) as AdminAlertRecord[];
  }

  countOpen(): Promise<number> {
    return this.client().count({ where: { status: "open" } });
  }

  private client(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { adminAlert: Delegate }).adminAlert;
  }
}

/** Spec 061: liveness of the spec 057 worker (one row per worker name). */
export interface WorkerHeartbeatRepository extends RuntimeRepository {
  beat(name: string, at: Date): Promise<void>;
  last(name: string): Promise<{ lastBeatAt: Date; cycles: number } | undefined>;
}

export class MemoryWorkerHeartbeatRepository implements WorkerHeartbeatRepository {
  readonly mode = "memory-test" as const;
  private readonly beats = new Map<string, { lastBeatAt: Date; cycles: number }>();

  async beat(name: string, at: Date): Promise<void> {
    const previous = this.beats.get(name);
    this.beats.set(name, { lastBeatAt: at, cycles: (previous?.cycles ?? 0) + 1 });
  }

  async last(name: string): Promise<{ lastBeatAt: Date; cycles: number } | undefined> {
    return this.beats.get(name);
  }
}

export class PrismaWorkerHeartbeatRepository implements WorkerHeartbeatRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async beat(name: string, at: Date): Promise<void> {
    await this.client().upsert({
      where: { name },
      create: { name, lastBeatAt: at, cycles: 1 },
      update: { lastBeatAt: at, cycles: { increment: 1 } }
    });
  }

  async last(name: string): Promise<{ lastBeatAt: Date; cycles: number } | undefined> {
    return (await this.client().findUnique({ where: { name } }) ?? undefined) as { lastBeatAt: Date; cycles: number } | undefined;
  }

  private client(): { upsert(input: unknown): Promise<unknown>; findUnique(input: unknown): Promise<unknown | null> } {
    return (this.prisma.requireRuntimeClient() as unknown as { workerHeartbeat: { upsert(input: unknown): Promise<unknown>; findUnique(input: unknown): Promise<unknown | null> } }).workerHeartbeat;
  }
}
