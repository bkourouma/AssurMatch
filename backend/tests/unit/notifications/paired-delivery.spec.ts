import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { NotificationsModule } from "../../../src/modules/notifications/notifications.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("paired notification delivery", () => {
  it("queues WhatsApp and email for every notification", async () => {
    const module = new NotificationsModule(new AuditLogWriter());
    const result = await module.service.queuePaired({
      type: "feature_flag_changed",
      recipientScope: "platform",
      payloadReference: "flag-change"
    }, superAdminActor);

    expect(result.notification.whatsAppStatus).toBe("queued");
    expect(result.notification.emailStatus).toBe("queued");
  });
});
