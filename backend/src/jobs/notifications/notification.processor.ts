import type { QueuePort } from "../../modules/common/queues/queues.module";
import type { NotificationsService } from "../../modules/notifications/notifications.module";

export class NotificationProcessor {
  constructor(private readonly notifications: NotificationsService, private readonly queue: QueuePort) {}

  process(notificationId: string, jobId: string): void {
    this.queue.transition(jobId, "active");
    this.notifications.updateDelivery(notificationId, "sent", "sent");
    this.queue.transition(jobId, "completed");
  }

  processQuoteNotification(notificationId: string, jobId: string): void {
    this.process(notificationId, jobId);
  }

  processAiSummary(jobId: string): void {
    this.queue.transition(jobId, "active");
    this.queue.transition(jobId, "completed");
  }

  fail(jobId: string, reason: string): void {
    this.queue.transition(jobId, "retryable", reason);
  }
}
