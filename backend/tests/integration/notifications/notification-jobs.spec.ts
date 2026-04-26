import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { NotificationProcessor } from "../../../src/jobs/notifications/notification.processor";
import { NotificationsModule } from "../../../src/modules/notifications/notifications.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("notification jobs", () => {
  it("makes paired delivery status visible through queue records", async () => {
    const module = new NotificationsModule(new AuditLogWriter());
    const queued = await module.service.queuePaired({
      type: "critical_job_failed",
      recipientScope: "platform",
      payloadReference: "job-failure"
    }, superAdminActor);
    new NotificationProcessor(module.service, module.queue).process(queued.notification.id, queued.job.id);

    expect(module.queue.list()[0]?.status).toBe("completed");
    expect((await module.service.list())[0]?.emailStatus).toBe("sent");
  });
});
