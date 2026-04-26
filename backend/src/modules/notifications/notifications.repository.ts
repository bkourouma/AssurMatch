import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { NotificationRecord } from "./notifications.module";

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");

export interface NotificationsRepository extends RuntimeRepository {
  create(notification: NotificationRecord): NotificationRecord;
  updateDelivery(id: string, update: Pick<NotificationRecord, "whatsAppStatus" | "emailStatus" | "updatedAt">): NotificationRecord;
  list(): NotificationRecord[];
  mutableList(): NotificationRecord[];
}

export class MemoryNotificationsRepository implements NotificationsRepository {
  readonly mode = "memory-test" as const;
  private readonly notifications: NotificationRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "NotificationsRepository");
  }

  create(notification: NotificationRecord): NotificationRecord {
    this.notifications.push(notification);
    return notification;
  }

  updateDelivery(id: string, update: Pick<NotificationRecord, "whatsAppStatus" | "emailStatus" | "updatedAt">): NotificationRecord {
    const notification = this.notifications.find((candidate) => candidate.id === id);
    if (!notification) throw new Error(`Notification ${id} not found`);
    Object.assign(notification, update);
    return notification;
  }

  list(): NotificationRecord[] {
    return [...this.notifications];
  }

  mutableList(): NotificationRecord[] {
    return this.notifications;
  }
}
