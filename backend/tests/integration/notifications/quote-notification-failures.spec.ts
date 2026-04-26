import { describe, expect, it } from "vitest";
import { NotificationProcessor } from "../../../src/jobs/notifications/notification.processor";
import { NotificationsModule } from "../../../src/modules/notifications/notifications.module";

describe("quote notification failures", () => {
  it("marks failed quote notification jobs retryable without creating assignments", async () => {
    const module = new NotificationsModule();
    const job = module.queue.add("visitor-quote-notifications", "visitor_quote_notification", "quote-1", "corr");
    new NotificationProcessor(module.service, module.queue).fail(job.id, "temporary provider failure");

    const stored = await module.queue.list()[0];
    expect(stored?.status).toBe("retryable");
    expect(stored?.retryCount).toBe(1);
  });
});
