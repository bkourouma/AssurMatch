import { notificationSchema, type NotificationDto, type NotificationRecordDto } from "../../../../packages/shared/contracts/ops.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { InMemoryQueue, type QueueJobRecord, type QueuePort } from "../common/queues/queues.module";
import type { ActorContext } from "../common/types";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { MessagingProviderAccessRefusedError, MessagingProviderService, type MessagingFeatureFlags, type MessagingProviderConfig } from "./messaging-provider.service";
import { MemoryNotificationsRepository, type NotificationsRepository } from "./notifications.repository";
import { MessagingDispatchService } from "./messaging-dispatch.service";
import type { MessagingRepository } from "./messaging.repository";
import { QuoteNotificationService } from "./quote-notification.service";

export interface NotificationRecord extends NotificationRecordDto {
  id: string;
  queueJobRecordId?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Optional partner webhook observer for `notification.failed`; failures never break delivery updates. */
export interface NotificationEventObserver {
  publish(eventType: "notification.failed", partnerTenantId: string, data: Record<string, unknown>): Promise<void>;
}

export class NotificationsService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly queue: QueuePort,
    private readonly repository: NotificationsRepository = new MemoryNotificationsRepository(),
    private readonly events?: NotificationEventObserver | undefined
  ) {}

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

  async updateDelivery(
    id: string,
    whatsAppStatus: NotificationRecord["whatsAppStatus"],
    emailStatus: NotificationRecord["emailStatus"],
    // Spec 044: the retry count has to be persisted with the status, otherwise a permanently
    // failing recipient retries forever and the cap never bites.
    retryCount?: number
  ): Promise<NotificationRecord> {
    const updated = await this.repository.updateDelivery(id, {
      whatsAppStatus,
      emailStatus,
      updatedAt: new Date(),
      ...(retryCount === undefined ? {} : { retryCount })
    });
    // A partner-scoped notification that failed on every channel is reported to the partner's system.
    const partnerTenantId = updated.recipientScope.startsWith("partner:") ? updated.recipientScope.slice("partner:".length) : undefined;
    if (partnerTenantId && whatsAppStatus === "failed" && emailStatus === "failed") {
      await this.events?.publish("notification.failed", partnerTenantId, {
        notificationId: updated.id,
        notificationType: updated.type,
        failureClass: "all_channels_failed"
      });
    }
    return updated;
  }
}

export class NotificationsModule {
  readonly queue: QueuePort;
  readonly service: NotificationsService;
  readonly quoteService: QuoteNotificationService;
  readonly messagingProviders: MessagingProviderService;
  readonly dispatch: MessagingDispatchService;
  readonly adminController: AdminNotificationsController;

  constructor(
    audit = new AuditLogWriter(),
    queue: QueuePort = new InMemoryQueue(),
    repository?: NotificationsRepository,
    messagingProviderConfig: MessagingProviderConfig = {},
    featureFlags: MessagingFeatureFlags = { isEnabled: () => false },
    messagingRepository?: MessagingRepository,
    events?: NotificationEventObserver
  ) {
    this.queue = queue;
    this.service = new NotificationsService(audit, this.queue, repository, events);
    this.messagingProviders = new MessagingProviderService(audit, featureFlags, messagingProviderConfig);
    this.dispatch = new MessagingDispatchService({
      audit,
      featureFlags,
      config: messagingProviderConfig,
      ...(messagingRepository ? { repository: messagingRepository } : {})
    });
    this.quoteService = new QuoteNotificationService(repository ? this.service : this.service.mutableList(), this.queue, audit, this.dispatch);
    this.adminController = new AdminNotificationsController(this.service);
  }
}

export { NOTIFICATIONS_REPOSITORY, MemoryNotificationsRepository, type NotificationsRepository } from "./notifications.repository";
export { MessagingProviderAuditActions } from "./messaging-provider-audit-actions";
export { MessagingProviderAccessRefusedError, MessagingProviderService, type MessagingProviderConfig };
export { MessagingDispatchService } from "./messaging-dispatch.service";
export { LoggingMessagingProvider, type MessagingProviderPort } from "./messaging-provider.port";
export { MESSAGING_REPOSITORY, MemoryMessagingRepository, PrismaMessagingRepository, type MessagingRepository } from "./messaging.repository";
