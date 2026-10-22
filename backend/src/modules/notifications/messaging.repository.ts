import type { MessagingDeliveryStatus, NotificationChannel, OptionalChannel } from "../../../../packages/shared/contracts/messaging-provider.contracts";
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

/** Lot 10 (spec 076): durable retry row. Recipient and body stay encrypted and are blanked at a terminal status. */
export interface ChannelOutboxRecord {
  id: string;
  channel: OptionalChannel;
  scopeId: string;
  partnerTenantId: string | null;
  template: string;
  recipientEncrypted: string;
  bodyEncrypted: string;
  status: "retryable" | "sent" | "failed" | "dead_letter" | "cancelled";
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastErrorClass: string | null;
  providerMessageId: string | null;
  correlationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagingRepository extends RuntimeRepository {
  recordDelivery(record: MessagingDeliveryRecord): Promise<MessagingDeliveryRecord>;
  listDeliveries(limit: number): Promise<MessagingDeliveryRecord[]>;
  findPreference(scopeId: string): Promise<NotificationPreferenceRecord | undefined>;
  upsertPreference(record: NotificationPreferenceRecord): Promise<NotificationPreferenceRecord>;
  createInApp(record: InAppNotificationRecord): Promise<InAppNotificationRecord>;
  listInApp(recipientScopeId: string, limit: number): Promise<InAppNotificationRecord[]>;
  markInAppRead(id: string, recipientScopeId: string): Promise<InAppNotificationRecord | undefined>;
  createOutbox(record: ChannelOutboxRecord): Promise<ChannelOutboxRecord>;
  updateOutbox(id: string, patch: Partial<ChannelOutboxRecord>): Promise<ChannelOutboxRecord | undefined>;
  /** Retryable rows whose nextAttemptAt is reached, oldest first. */
  listDueOutbox(now: Date, limit: number): Promise<ChannelOutboxRecord[]>;
  /** Most recent first. */
  listOutbox(limit: number): Promise<ChannelOutboxRecord[]>;
  /**
   * Atomic claim: if the row is still retryable and due, push nextAttemptAt to claimUntil and return true.
   * A concurrent worker then sees the row as not due and cannot send the same message twice.
   */
  claimOutbox(id: string, now: Date, claimUntil: Date): Promise<boolean>;
}

export class MemoryMessagingRepository implements MessagingRepository {
  readonly mode = "memory-test" as const;
  private readonly deliveries: MessagingDeliveryRecord[] = [];
  private readonly preferences: NotificationPreferenceRecord[] = [];
  private readonly inApp: InAppNotificationRecord[] = [];
  private readonly outbox: ChannelOutboxRecord[] = [];

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

  async createOutbox(record: ChannelOutboxRecord): Promise<ChannelOutboxRecord> {
    this.outbox.push({ ...record });
    return { ...record };
  }

  async updateOutbox(id: string, patch: Partial<ChannelOutboxRecord>): Promise<ChannelOutboxRecord | undefined> {
    const index = this.outbox.findIndex((row) => row.id === id);
    if (index < 0) return undefined;
    const merged = { ...(this.outbox[index] as ChannelOutboxRecord), ...patch, id };
    this.outbox[index] = merged;
    return { ...merged };
  }

  async listDueOutbox(now: Date, limit: number): Promise<ChannelOutboxRecord[]> {
    return this.outbox
      .filter((row) => row.status === "retryable" && row.nextAttemptAt !== null && row.nextAttemptAt.getTime() <= now.getTime())
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async listOutbox(limit: number): Promise<ChannelOutboxRecord[]> {
    return [...this.outbox].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, limit).map((row) => ({ ...row }));
  }

  async claimOutbox(id: string, now: Date, claimUntil: Date): Promise<boolean> {
    const row = this.outbox.find((candidate) => candidate.id === id);
    if (!row || row.status !== "retryable" || row.nextAttemptAt === null || row.nextAttemptAt.getTime() > now.getTime()) return false;
    row.nextAttemptAt = claimUntil;
    return true;
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
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

  async createOutbox(record: ChannelOutboxRecord): Promise<ChannelOutboxRecord> {
    return await this.delegate("channelOutbox").create({ data: record }) as ChannelOutboxRecord;
  }

  async updateOutbox(id: string, patch: Partial<ChannelOutboxRecord>): Promise<ChannelOutboxRecord | undefined> {
    const { id: _ignored, ...data } = patch;
    void _ignored;
    const existing = await this.delegate("channelOutbox").findFirst({ where: { id } });
    if (!existing) return undefined;
    return await this.delegate("channelOutbox").update({ where: { id }, data }) as ChannelOutboxRecord;
  }

  async listDueOutbox(now: Date, limit: number): Promise<ChannelOutboxRecord[]> {
    return await this.delegate("channelOutbox").findMany({ where: { status: "retryable", nextAttemptAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: limit }) as ChannelOutboxRecord[];
  }

  async listOutbox(limit: number): Promise<ChannelOutboxRecord[]> {
    return await this.delegate("channelOutbox").findMany({ orderBy: { createdAt: "desc" }, take: limit }) as ChannelOutboxRecord[];
  }

  async claimOutbox(id: string, now: Date, claimUntil: Date): Promise<boolean> {
    const result = await this.delegate("channelOutbox").updateMany({
      where: { id, status: "retryable", nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: claimUntil }
    });
    return result.count === 1;
  }

  private delegate(name: "messagingDelivery" | "notificationPreference" | "inAppNotification" | "channelOutbox"): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }
}

export const MESSAGING_REPOSITORY = "MESSAGING_REPOSITORY";
