import { notificationSchema, type NotificationDto, type NotificationRecordDto } from "../../../../packages/shared/contracts/ops.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { InMemoryQueue, type QueueJobRecord } from "../common/queues/queues.module";
import type { ActorContext } from "../common/types";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { QuoteNotificationService } from "./quote-notification.service";

export interface NotificationRecord extends NotificationRecordDto {
  id: string;
  queueJobRecordId?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationsService {
  private readonly notifications: NotificationRecord[] = [];

  constructor(private readonly audit: AuditLogWriter, private readonly queue: InMemoryQueue) {}

  queuePaired(input: NotificationDto, actor: ActorContext): { notification: NotificationRecord; job: QueueJobRecord } {
    const parsed = notificationSchema.parse(input);
    const now = new Date();
    const job = this.queue.add("notifications", "notification", parsed.payloadReference, actor.correlationId);
    const notification: NotificationRecord = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      whatsAppStatus: "queued",
      emailStatus: "queued",
      queueJobRecordId: job.id,
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.notifications.push(notification);
    this.audit.write({
      actor,
      action: "notification.queued",
      targetType: "Notification",
      targetId: notification.id,
      result: "success",
      context: { type: notification.type, pairedDelivery: true }
    });
    return { notification, job };
  }

  list(): NotificationRecord[] {
    return [...this.notifications];
  }

  mutableList(): NotificationRecord[] {
    return this.notifications;
  }

  updateDelivery(id: string, whatsAppStatus: NotificationRecord["whatsAppStatus"], emailStatus: NotificationRecord["emailStatus"]): NotificationRecord {
    const notification = this.notifications.find((candidate) => candidate.id === id);
    if (!notification) throw new Error(`Notification ${id} not found`);
    notification.whatsAppStatus = whatsAppStatus;
    notification.emailStatus = emailStatus;
    notification.updatedAt = new Date();
    return notification;
  }
}

export class NotificationsModule {
  readonly queue = new InMemoryQueue();
  readonly service: NotificationsService;
  readonly quoteService: QuoteNotificationService;
  readonly adminController: AdminNotificationsController;

  constructor(audit = new AuditLogWriter()) {
    this.service = new NotificationsService(audit, this.queue);
    this.quoteService = new QuoteNotificationService(this.service.mutableList(), this.queue, audit);
    this.adminController = new AdminNotificationsController(this.service);
  }
}
