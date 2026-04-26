import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuditLogsService } from "../../../src/modules/audit-logs/audit-logs.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("audit log search and masking", () => {
  it("filters audit logs and masks PII in contexts", async () => {
    const writer = new AuditLogWriter();
    writer.write({
      actor: superAdminActor,
      action: "security_admin_change",
      targetType: "User",
      targetId: "user-1",
      result: "success",
      context: { email: "person@example.com" }
    });
    const logs = new AuditLogsService(writer).search(superAdminActor, { action: "security_admin_change" });

    expect(logs).toHaveLength(1);
    expect(String(logs[0]?.context.email)).toBe("[masked-email]");
  });
});
