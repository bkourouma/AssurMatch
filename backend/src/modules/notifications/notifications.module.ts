import { notificationSchema, type NotificationDto, type NotificationRecordDto } from "../../../../packages/shared/contracts/ops.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { InMemoryQueue, type QueueJobRecord, type QueuePort } from "../common/queues/queues.module";
import type { ActorContext } from "../common/types";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { MessagingProviderAccessRefusedError, MessagingProviderService, type MessagingFeatureFlags, type MessagingProviderConfig } from "./messaging-provider.service";
import { MemoryNotificationsRepository, type NotificationsRepository } from "./notifications.repository";
import { QuoteNotificationService } from "./quote-notification.service";

export interface NotificationRecord extends NotificationRecordDto {
  id: string;
  queueJobRecordId?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationsService {
  constructor(private readonly audit: AuditLogWriter, private readonly queue: QueuePort, private readonly repository: NotificationsRepository = new MemoryNotificationsRepository()) {}

  async queuePaired(input: NotificationDto, actor: ActorContext): Promise<{ notification: NotificationRecord; job: QueueJobRecord }> {
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
    await this.repository.create(notification);
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

  async recordQueued(notification: NotificationRecord, actor: ActorContext): Promise<NotificationRecord> {
    await this.repository.create(notification);
    this.audit.write({
      actor,
      action: "notification.queued",
      targetType: "Notification",
      targetId: notification.id,
      result: "success",
      context: { type: notification.type, pairedDelivery: true }
    });
    return notification;
  }

  list(): Promise<NotificationRecord[]> {
    return this.repository.list();
  }

  mutableList(): NotificationRecord[] {
    return this.repository.mutableList();
  }

  updateDelivery(id: string, whatsAppStatus: NotificationRecord["whatsAppStatus"], emailStatus: NotificationRecord["emailStatus"]): Promise<NotificationRecord> {
    return this.repository.updateDelivery(id, { whatsAppStatus, emailStatus, updatedAt: new Date() });
  }
}

export class NotificationsModule {
  readonly queue: QueuePort;
  readonly service: NotificationsService;
  readonly quoteService: QuoteNotificationService;
  readonly messagingProviders: MessagingProviderService;
  readonly adminController: AdminNotificationsController;

  constructor(
    audit = new AuditLogWriter(),
    queue: QueuePort = new InMemoryQueue(),
    repository?: NotificationsRepository,
    messagingProviderConfig: MessagingProviderConfig = {},
    featureFlags: MessagingFeatureFlags = { isEnabled: () => false }
  ) {
    this.queue = queue;
    this.service = new NotificationsService(audit, this.queue, repository);
    this.quoteService = new QuoteNotificationService(repository ? this.service : this.service.mutableList(), this.queue, audit);
    this.messagingProviders = new MessagingProviderService(audit, featureFlags, messagingProviderConfig);
    this.adminController = new AdminNotificationsController(this.service);
  }
}

export { NOTIFICATIONS_REPOSITORY, MemoryNotificationsRepository, type NotificationsRepository } from "./notifications.repository";
export { MessagingProviderAuditActions } from "./messaging-provider-audit-actions";
export { MessagingProviderAccessRefusedError, MessagingProviderService, type MessagingProviderConfig };
