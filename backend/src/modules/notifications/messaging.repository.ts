import type { MessagingDeliveryStatus, NotificationChannel } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface MessagingDeliveryRecord {
  id: string;
  channel: NotificationChannel;
  status: MessagingDeliveryStatus;
  template: string;
  recipientMasked: string;
  provider: string;
  partnerTenantId: string | null;
  scopeId: string;
  reason: string | null;
  correlationId: string | null;
  createdAt: Date;
}

export interface NotificationPreferenceRecord {
  id: string;
  scopeId: string;
  sms: boolean;
  whatsapp: boolean;
  reason: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InAppNotificationRecord {
  id: string;
  recipientScopeId: string;
  type: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  read: boolean;
  createdAt: Date;
}

export interface MessagingRepository extends RuntimeRepository {
  recordDelivery(record: MessagingDeliveryRecord): Promise<MessagingDeliveryRecord>;
  listDeliveries(limit: number): Promise<MessagingDeliveryRecord[]>;
  findPreference(scopeId: string): Promise<NotificationPreferenceRecord | undefined>;
  upsertPreference(record: NotificationPreferenceRecord): Promise<NotificationPreferenceRecord>;
  createInApp(record: InAppNotificationRecord): Promise<InAppNotificationRecord>;
  listInApp(recipientScopeId: string, limit: number): Promise<InAppNotificationRecord[]>;
  markInAppRead(id: string, recipientScopeId: string): Promise<InAppNotificationRecord | undefined>;
}

export class MemoryMessagingRepository implements MessagingRepository {
  readonly mode = "memory-test" as const;
  private readonly deliveries: MessagingDeliveryRecord[] = [];
  private readonly preferences: NotificationPreferenceRecord[] = [];
  private readonly inApp: InAppNotificationRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "MessagingRepository");
  }

  async recordDelivery(record: MessagingDeliveryRecord): Promise<MessagingDeliveryRecord> {
    this.deliveries.push(record);
    return record;
  }

  async listDeliveries(limit: number): Promise<MessagingDeliveryRecord[]> {
    return [...this.deliveries].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, limit);
  }

  async findPreference(scopeId: string): Promise<NotificationPreferenceRecord | undefined> {
    return this.preferences.find((preference) => preference.scopeId === scopeId);
  }

  async upsertPreference(record: NotificationPreferenceRecord): Promise<NotificationPreferenceRecord> {
    const index = this.preferences.findIndex((preference) => preference.scopeId === record.scopeId);
    if (index >= 0) {
      const existing = this.preferences[index] as NotificationPreferenceRecord;
      const merged = { ...record, id: existing.id, createdAt: existing.createdAt };
      this.preferences[index] = merged;
      return merged;
    }
    this.preferences.push(record);
    return record;
  }

  async createInApp(record: InAppNotificationRecord): Promise<InAppNotificationRecord> {
    this.inApp.push(record);
    return record;
  }

  async listInApp(recipientScopeId: string, limit: number): Promise<InAppNotificationRecord[]> {
    return this.inApp
      .filter((notification) => notification.recipientScopeId === recipientScopeId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  async markInAppRead(id: string, recipientScopeId: string): Promise<InAppNotificationRecord | undefined> {
    const notification = this.inApp.find((candidate) => candidate.id === id && candidate.recipientScopeId === recipientScopeId);
    if (!notification) return undefined;
    notification.read = true;
    return notification;
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  update(input: unknown): Promise<unknown>;
  upsert(input: unknown): Promise<unknown>;
};

export class PrismaMessagingRepository implements MessagingRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async recordDelivery(record: MessagingDeliveryRecord): Promise<MessagingDeliveryRecord> {
    return await this.delegate("messagingDelivery").create({ data: record }) as MessagingDeliveryRecord;
  }

  async listDeliveries(limit: number): Promise<MessagingDeliveryRecord[]> {
    return await this.delegate("messagingDelivery").findMany({ orderBy: { createdAt: "desc" }, take: limit }) as MessagingDeliveryRecord[];
  }

  async findPreference(scopeId: string): Promise<NotificationPreferenceRecord | undefined> {
    return (await this.delegate("notificationPreference").findFirst({ where: { scopeId } }) ?? undefined) as NotificationPreferenceRecord | undefined;
  }

  async upsertPreference(record: NotificationPreferenceRecord): Promise<NotificationPreferenceRecord> {
    const data = { sms: record.sms, whatsapp: record.whatsapp, reason: record.reason, updatedById: record.updatedById, updatedAt: record.updatedAt };
    return await this.delegate("notificationPreference").upsert({
      where: { scopeId: record.scopeId },
      create: { id: record.id, scopeId: record.scopeId, createdAt: record.createdAt, ...data },
      update: data
    }) as NotificationPreferenceRecord;
  }

  async createInApp(record: InAppNotificationRecord): Promise<InAppNotificationRecord> {
    return await this.delegate("inAppNotification").create({ data: record }) as InAppNotificationRecord;
  }

  async listInApp(recipientScopeId: string, limit: number): Promise<InAppNotificationRecord[]> {
    return await this.delegate("inAppNotification").findMany({ where: { recipientScopeId }, orderBy: { createdAt: "desc" }, take: limit }) as InAppNotificationRecord[];
  }

  async markInAppRead(id: string, recipientScopeId: string): Promise<InAppNotificationRecord | undefined> {
    const existing = await this.delegate("inAppNotification").findFirst({ where: { id, recipientScopeId } });
    if (!existing) return undefined;
    return await this.delegate("inAppNotification").update({ where: { id }, data: { read: true } }) as InAppNotificationRecord;
  }

  private delegate(name: "messagingDelivery" | "notificationPreference" | "inAppNotification"): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }
}

export const MESSAGING_REPOSITORY = "MESSAGING_REPOSITORY";
