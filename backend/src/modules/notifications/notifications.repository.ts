import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { NotificationRecord } from "./notifications.module";

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");

export interface NotificationsRepository extends RuntimeRepository {
  create(notification: NotificationRecord): Promise<NotificationRecord>;
  updateDelivery(id: string, update: Pick<NotificationRecord, "whatsAppStatus" | "emailStatus" | "updatedAt"> & Partial<Pick<NotificationRecord, "retryCount">>): Promise<NotificationRecord>;
  list(): Promise<NotificationRecord[]>;
  /** Spec 054 R3: the row already queued for this idempotency key, if any. */
  findByDedupeKey(dedupeKey: string): Promise<NotificationRecord | undefined>;
  mutableList(): NotificationRecord[];
}

export class MemoryNotificationsRepository implements NotificationsRepository {
  readonly mode = "memory-test" as const;
  private readonly notifications: NotificationRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "NotificationsRepository");
  }

  async create(notification: NotificationRecord): Promise<NotificationRecord> {
    this.notifications.push(notification);
    return notification;
  }

  async updateDelivery(id: string, update: Pick<NotificationRecord, "whatsAppStatus" | "emailStatus" | "updatedAt"> & Partial<Pick<NotificationRecord, "retryCount">>): Promise<NotificationRecord> {
    const notification = this.notifications.find((candidate) => candidate.id === id);
    if (!notification) throw new Error(`Notification ${id} not found`);
    Object.assign(notification, update);
    return notification;
  }

  async list(): Promise<NotificationRecord[]> {
    return [...this.notifications];
  }

  async findByDedupeKey(dedupeKey: string): Promise<NotificationRecord | undefined> {
    return this.notifications.find((notification) => notification.dedupeKey === dedupeKey);
  }

  mutableList(): NotificationRecord[] {
    return this.notifications;
  }
}

type NotificationDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaNotificationsRepository implements NotificationsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(notification: NotificationRecord): Promise<NotificationRecord> {
    return this.toDomain(await this.client().create({ data: { ...notification } }));
  }

  async updateDelivery(id: string, update: Pick<NotificationRecord, "whatsAppStatus" | "emailStatus" | "updatedAt"> & Partial<Pick<NotificationRecord, "retryCount">>): Promise<NotificationRecord> {
    return this.toDomain(await this.client().update({ where: { id }, data: update }));
  }

  async list(): Promise<NotificationRecord[]> {
    return (await this.client().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toDomain(row));
  }

  async findByDedupeKey(dedupeKey: string): Promise<NotificationRecord | undefined> {
    const row = await this.client().findUnique({ where: { dedupeKey } });
    return row ? this.toDomain(row) : undefined;
  }

  mutableList(): NotificationRecord[] {
    throw new Error("Prisma notification repository does not expose mutable test lists");
  }

  private client(): NotificationDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { notification: NotificationDelegate }).notification;
  }

  private toDomain(row: unknown): NotificationRecord {
    return row as NotificationRecord;
  }
}
