import type { CrmConnectorDeliveryStatus, CrmConnectorStatus, CrmEventType } from "../../../../packages/shared/contracts/crm-connector.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export const CRM_CONNECTOR_REPOSITORY = "CRM_CONNECTOR_REPOSITORY";

export interface CrmConnectorRecord {
  id: string;
  partnerTenantId: string;
  name: string;
  url: string;
  eventTypes: CrmEventType[];
  status: CrmConnectorStatus;
  secretEncrypted: string;
  secretHash: string;
  authHeaderName?: string | null | undefined;
  authHeaderValueEncrypted?: string | null | undefined;
  createdById?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrmConnectorDeliveryRecord {
  id: string;
  connectorId: string;
  partnerTenantId: string;
  eventId: string;
  eventType: CrmEventType;
  idempotencyKey: string;
  payloadEncrypted: string;
  payloadMetadata: Record<string, unknown>;
  status: CrmConnectorDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: Date | null | undefined;
  lastResponseClass?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrmConnectorRepository extends RuntimeRepository {
  createConnector(record: CrmConnectorRecord): Promise<CrmConnectorRecord>;
  updateConnector(id: string, update: Partial<CrmConnectorRecord>): Promise<CrmConnectorRecord>;
  listConnectors(): Promise<CrmConnectorRecord[]>;
  requireConnector(id: string): Promise<CrmConnectorRecord>;
  findConnectorByPartner(partnerTenantId: string): Promise<CrmConnectorRecord | undefined>;
  createDelivery(record: CrmConnectorDeliveryRecord): Promise<CrmConnectorDeliveryRecord>;
  updateDelivery(id: string, update: Partial<CrmConnectorDeliveryRecord>): Promise<CrmConnectorDeliveryRecord>;
  requireDelivery(id: string): Promise<CrmConnectorDeliveryRecord>;
  listDeliveries(connectorId?: string): Promise<CrmConnectorDeliveryRecord[]>;
  listDueDeliveries(input: { now: Date; limit: number }): Promise<CrmConnectorDeliveryRecord[]>;
  /**
   * Atomically leases a due delivery (pending or retryable, nextAttemptAt <= now) by pushing
   * nextAttemptAt to `leaseUntil`. Returns undefined when another worker already holds it.
   */
  claimDelivery(input: { id: string; now: Date; leaseUntil: Date }): Promise<CrmConnectorDeliveryRecord | undefined>;
}

function isDue(record: CrmConnectorDeliveryRecord, now: Date): boolean {
  return (record.status === "pending" || record.status === "retryable")
    && (!record.nextAttemptAt || record.nextAttemptAt.getTime() <= now.getTime());
}

function definedEntries(update: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

export class MemoryCrmConnectorRepository implements CrmConnectorRepository {
  readonly mode = "memory-test" as const;
  private readonly connectors: CrmConnectorRecord[] = [];
  private readonly deliveries: CrmConnectorDeliveryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "CrmConnectorRepository");
  }

  async createConnector(record: CrmConnectorRecord): Promise<CrmConnectorRecord> {
    if (this.connectors.some((candidate) => candidate.partnerTenantId === record.partnerTenantId)) {
      throw new Error("CRM connector already exists for this partner");
    }
    this.connectors.push({ ...record });
    return { ...record };
  }

  async updateConnector(id: string, update: Partial<CrmConnectorRecord>): Promise<CrmConnectorRecord> {
    const record = this.find(id);
    Object.assign(record, definedEntries(update));
    return { ...record };
  }

  async listConnectors(): Promise<CrmConnectorRecord[]> {
    return this.connectors.map((record) => ({ ...record }));
  }

  async requireConnector(id: string): Promise<CrmConnectorRecord> {
    return { ...this.find(id) };
  }

  async findConnectorByPartner(partnerTenantId: string): Promise<CrmConnectorRecord | undefined> {
    const record = this.connectors.find((candidate) => candidate.partnerTenantId === partnerTenantId);
    return record ? { ...record } : undefined;
  }

  async createDelivery(record: CrmConnectorDeliveryRecord): Promise<CrmConnectorDeliveryRecord> {
    if (this.deliveries.some((candidate) => candidate.idempotencyKey === record.idempotencyKey)) {
      throw new Error("CRM connector delivery idempotency key already exists");
    }
    this.deliveries.push({ ...record });
    return { ...record };
  }

  async updateDelivery(id: string, update: Partial<CrmConnectorDeliveryRecord>): Promise<CrmConnectorDeliveryRecord> {
    const record = this.findDelivery(id);
    Object.assign(record, definedEntries(update));
    return { ...record };
  }

  async requireDelivery(id: string): Promise<CrmConnectorDeliveryRecord> {
    return { ...this.findDelivery(id) };
  }

  async listDeliveries(connectorId?: string): Promise<CrmConnectorDeliveryRecord[]> {
    return this.deliveries
      .filter((record) => !connectorId || record.connectorId === connectorId)
      .map((record) => ({ ...record }))
      .reverse();
  }

  async listDueDeliveries({ now, limit }: { now: Date; limit: number }): Promise<CrmConnectorDeliveryRecord[]> {
    return this.deliveries.filter((record) => isDue(record, now)).slice(0, limit).map((record) => ({ ...record }));
  }

  async claimDelivery({ id, now, leaseUntil }: { id: string; now: Date; leaseUntil: Date }): Promise<CrmConnectorDeliveryRecord | undefined> {
    // Check and set run in the same synchronous turn, so two workers cannot both win.
    const record = this.deliveries.find((candidate) => candidate.id === id);
    if (!record || !isDue(record, now)) return undefined;
    record.nextAttemptAt = leaseUntil;
    record.updatedAt = now;
    return { ...record };
  }

  private find(id: string): CrmConnectorRecord {
    const record = this.connectors.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`CRM connector ${id} not found`);
    return record;
  }

  private findDelivery(id: string): CrmConnectorDeliveryRecord {
    const record = this.deliveries.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`CRM connector delivery ${id} not found`);
    return record;
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
};

export class PrismaCrmConnectorRepository implements CrmConnectorRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async createConnector(record: CrmConnectorRecord): Promise<CrmConnectorRecord> {
    return this.toConnector(await this.connectorsDelegate().create({ data: definedEntries(record) }));
  }

  async updateConnector(id: string, update: Partial<CrmConnectorRecord>): Promise<CrmConnectorRecord> {
    return this.toConnector(await this.connectorsDelegate().update({ where: { id }, data: definedEntries(update) }));
  }

  async listConnectors(): Promise<CrmConnectorRecord[]> {
    return (await this.connectorsDelegate().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toConnector(row));
  }

  async requireConnector(id: string): Promise<CrmConnectorRecord> {
    const row = await this.connectorsDelegate().findUnique({ where: { id } });
    if (!row) throw new Error(`CRM connector ${id} not found`);
    return this.toConnector(row);
  }

  async findConnectorByPartner(partnerTenantId: string): Promise<CrmConnectorRecord | undefined> {
    const row = await this.connectorsDelegate().findFirst({ where: { partnerTenantId } });
    return row ? this.toConnector(row) : undefined;
  }

  async createDelivery(record: CrmConnectorDeliveryRecord): Promise<CrmConnectorDeliveryRecord> {
    return this.toDelivery(await this.deliveriesDelegate().create({ data: definedEntries(record) }));
  }

  async updateDelivery(id: string, update: Partial<CrmConnectorDeliveryRecord>): Promise<CrmConnectorDeliveryRecord> {
    return this.toDelivery(await this.deliveriesDelegate().update({ where: { id }, data: definedEntries(update) }));
  }

  async requireDelivery(id: string): Promise<CrmConnectorDeliveryRecord> {
    const row = await this.deliveriesDelegate().findUnique({ where: { id } });
    if (!row) throw new Error(`CRM connector delivery ${id} not found`);
    return this.toDelivery(row);
  }

  async listDeliveries(connectorId?: string): Promise<CrmConnectorDeliveryRecord[]> {
    const rows = await this.deliveriesDelegate().findMany({
      ...(connectorId ? { where: { connectorId } } : {}),
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return rows.map((row) => this.toDelivery(row));
  }

  async listDueDeliveries({ now, limit }: { now: Date; limit: number }): Promise<CrmConnectorDeliveryRecord[]> {
    const rows = await this.deliveriesDelegate().findMany({
      where: {
        status: { in: ["pending", "retryable"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
      },
      orderBy: { createdAt: "asc" },
      take: limit
    });
    return rows.map((row) => this.toDelivery(row));
  }

  async claimDelivery({ id, now, leaseUntil }: { id: string; now: Date; leaseUntil: Date }): Promise<CrmConnectorDeliveryRecord | undefined> {
    // Conditional update: only one concurrent worker sees count === 1.
    const result = await this.deliveriesDelegate().updateMany({
      where: {
        id,
        status: { in: ["pending", "retryable"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
      },
      data: { nextAttemptAt: leaseUntil, updatedAt: now }
    });
    if (result.count !== 1) return undefined;
    return this.requireDelivery(id);
  }

  private connectorsDelegate(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { crmConnector: Delegate }).crmConnector;
  }

  private deliveriesDelegate(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { crmConnectorDelivery: Delegate }).crmConnectorDelivery;
  }

  private toConnector(row: unknown): CrmConnectorRecord {
    return row as CrmConnectorRecord;
  }

  private toDelivery(row: unknown): CrmConnectorDeliveryRecord {
    return row as CrmConnectorDeliveryRecord;
  }
}
