import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { AuditLogRepository } from "../../../src/modules/audit-logs/audit-log-repository";

describe("AuditLogWriter durable boundary", () => {
  it("surfaces persistence failures through writeAsync", async () => {
    const repository: AuditLogRepository = {
      mode: "prisma-runtime",
      persist: () => Promise.reject(new Error("database unavailable"))
    };
    const writer = new AuditLogWriter(repository);

    await expect(writer.writeAsync({
      action: "audit.failure_test",
      targetType: "AuditLog",
      targetId: "failure",
      result: "failed",
      context: {}
    })).rejects.toThrow("database unavailable");
  });
});
