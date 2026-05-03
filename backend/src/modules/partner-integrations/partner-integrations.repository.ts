import type { PartnerApiKeyStatus, PartnerApiScope, PartnerWebhookDeliveryStatus, PartnerWebhookEndpointStatus, PartnerWebhookEventType } from "../../../../packages/shared/contracts/partner-integration.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface PartnerApiKeyRecord {
  id: string;
  partnerTenantId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: PartnerApiScope[];
  status: PartnerApiKeyStatus;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export interface PartnerWebhookEndpointRecord {
  id: string;
  partnerTenantId: string;
  url: string;
  description?: string;
  eventTypes: PartnerWebhookEventType[];
  status: PartnerWebhookEndpointStatus;
  secretEncrypted: string;
  secretHash: string;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export interface PartnerWebhookDeliveryRecord {
  id: string;
  endpointId?: string;
  partnerTenantId: string;
  eventId: string;
  eventType: PartnerWebhookEventType;
  payload: Record<string, unknown>;
  payloadMetadata: Record<string, unknown>;
  status: PartnerWebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: Date;
  lastResponseClass?: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerIntegrationsRepository extends RuntimeRepository {
  createApiKey(record: PartnerApiKeyRecord): Promise<PartnerApiKeyRecord>;
  updateApiKey(id: string, update: Partial<PartnerApiKeyRecord>): Promise<PartnerApiKeyRecord>;
  listApiKeys(): Promise<PartnerApiKeyRecord[]>;
  findApiKeyByHash(keyHash: string): Promise<PartnerApiKeyRecord | undefined>;
  requireApiKey(id: string): Promise<PartnerApiKeyRecord>;
  createEndpoint(record: PartnerWebhookEndpointRecord): Promise<PartnerWebhookEndpointRecord>;
  updateEndpoint(id: string, update: Partial<PartnerWebhookEndpointRecord>): Promise<PartnerWebhookEndpointRecord>;
  listEndpoints(): Promise<PartnerWebhookEndpointRecord[]>;
  requireEndpoint(id: string): Promise<PartnerWebhookEndpointRecord>;
  createDelivery(record: PartnerWebhookDeliveryRecord): Promise<PartnerWebhookDeliveryRecord>;
  updateDelivery(id: string, update: Partial<PartnerWebhookDeliveryRecord>): Promise<PartnerWebhookDeliveryRecord>;
  listDeliveries(): Promise<PartnerWebhookDeliveryRecord[]>;
}

export class MemoryPartnerIntegrationsRepository implements PartnerIntegrationsRepository {
  readonly mode = "memory-test" as const;
  private readonly apiKeys: PartnerApiKeyRecord[] = [];
  private readonly endpoints: PartnerWebhookEndpointRecord[] = [];
  private readonly deliveries: PartnerWebhookDeliveryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "PartnerIntegrationsRepository");
  }

  async createApiKey(record: PartnerApiKeyRecord): Promise<PartnerApiKeyRecord> {
    this.apiKeys.push(record);
    return record;
  }

  async updateApiKey(id: string, update: Partial<PartnerApiKeyRecord>): Promise<PartnerApiKeyRecord> {
    const record = await this.requireApiKey(id);
    Object.assign(record, update);
    return record;
  }

  async listApiKeys(): Promise<PartnerApiKeyRecord[]> {
    return [...this.apiKeys];
  }

  async findApiKeyByHash(keyHash: string): Promise<PartnerApiKeyRecord | undefined> {
    return this.apiKeys.find((record) => record.keyHash === keyHash);
  }

  async requireApiKey(id: string): Promise<PartnerApiKeyRecord> {
    const record = this.apiKeys.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Partner API key ${id} not found`);
    return record;
  }

  async createEndpoint(record: PartnerWebhookEndpointRecord): Promise<PartnerWebhookEndpointRecord> {
    this.endpoints.push(record);
    return record;
  }

  async updateEndpoint(id: string, update: Partial<PartnerWebhookEndpointRecord>): Promise<PartnerWebhookEndpointRecord> {
    const record = await this.requireEndpoint(id);
    Object.assign(record, update);
    return record;
  }

  async listEndpoints(): Promise<PartnerWebhookEndpointRecord[]> {
    return [...this.endpoints];
  }

  async requireEndpoint(id: string): Promise<PartnerWebhookEndpointRecord> {
    const record = this.endpoints.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Partner webhook endpoint ${id} not found`);
    return record;
  }

  async createDelivery(record: PartnerWebhookDeliveryRecord): Promise<PartnerWebhookDeliveryRecord> {
    this.deliveries.push(record);
    return record;
  }

  async updateDelivery(id: string, update: Partial<PartnerWebhookDeliveryRecord>): Promise<PartnerWebhookDeliveryRecord> {
    const record = this.deliveries.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Partner webhook delivery ${id} not found`);
    Object.assign(record, update);
    return record;
  }

  async listDeliveries(): Promise<PartnerWebhookDeliveryRecord[]> {
    return [...this.deliveries];
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
};

export class PrismaPartnerIntegrationsRepository implements PartnerIntegrationsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async createApiKey(record: PartnerApiKeyRecord): Promise<PartnerApiKeyRecord> {
    return this.toApiKey(await this.apiKeys().create({ data: record }));
  }

  async updateApiKey(id: string, update: Partial<PartnerApiKeyRecord>): Promise<PartnerApiKeyRecord> {
    return this.toApiKey(await this.apiKeys().update({ where: { id }, data: this.clean(update) }));
  }

  async listApiKeys(): Promise<PartnerApiKeyRecord[]> {
    return (await this.apiKeys().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toApiKey(row));
  }

  async findApiKeyByHash(keyHash: string): Promise<PartnerApiKeyRecord | undefined> {
    const row = await this.apiKeys().findFirst({ where: { keyHash } });
    return row ? this.toApiKey(row) : undefined;
  }

  async requireApiKey(id: string): Promise<PartnerApiKeyRecord> {
    const row = await this.apiKeys().findUnique({ where: { id } });
    if (!row) throw new Error(`Partner API key ${id} not found`);
    return this.toApiKey(row);
  }

  async createEndpoint(record: PartnerWebhookEndpointRecord): Promise<PartnerWebhookEndpointRecord> {
    return this.toEndpoint(await this.endpoints().create({ data: record }));
  }

  async updateEndpoint(id: string, update: Partial<PartnerWebhookEndpointRecord>): Promise<PartnerWebhookEndpointRecord> {
    return this.toEndpoint(await this.endpoints().update({ where: { id }, data: this.clean(update) }));
  }

  async listEndpoints(): Promise<PartnerWebhookEndpointRecord[]> {
    return (await this.endpoints().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toEndpoint(row));
  }

  async requireEndpoint(id: string): Promise<PartnerWebhookEndpointRecord> {
    const row = await this.endpoints().findUnique({ where: { id } });
    if (!row) throw new Error(`Partner webhook endpoint ${id} not found`);
    return this.toEndpoint(row);
  }

  async createDelivery(record: PartnerWebhookDeliveryRecord): Promise<PartnerWebhookDeliveryRecord> {
    return this.toDelivery(await this.deliveries().create({ data: record }));
  }

  async updateDelivery(id: string, update: Partial<PartnerWebhookDeliveryRecord>): Promise<PartnerWebhookDeliveryRecord> {
    return this.toDelivery(await this.deliveries().update({ where: { id }, data: this.clean(update) }));
  }

  async listDeliveries(): Promise<PartnerWebhookDeliveryRecord[]> {
    return (await this.deliveries().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDelivery(row));
  }

  private apiKeys(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerApiKey: Delegate }).partnerApiKey;
  }

  private endpoints(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerWebhookEndpoint: Delegate }).partnerWebhookEndpoint;
  }

  private deliveries(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerWebhookDelivery: Delegate }).partnerWebhookDelivery;
  }

  private clean(update: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
  }

  private toApiKey(row: unknown): PartnerApiKeyRecord {
    return row as PartnerApiKeyRecord;
  }

  private toEndpoint(row: unknown): PartnerWebhookEndpointRecord {
    return row as PartnerWebhookEndpointRecord;
  }

  private toDelivery(row: unknown): PartnerWebhookDeliveryRecord {
    return row as PartnerWebhookDeliveryRecord;
  }
}
