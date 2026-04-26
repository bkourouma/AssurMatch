import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../../src/modules/common/types";
import { AuditLogWriter } from "../../src/modules/audit-logs/audit-log-writer.service";
import { PrismaAuditLogRepository } from "../../src/modules/audit-logs/audit-log-repository";
import type { PrismaService } from "../../src/modules/common/prisma/prisma.service";

class CapturingPrismaAuditService {
  readonly persisted: AuditEntry[] = [];

  persistAuditLog(entry: AuditEntry): Promise<void> {
    this.persisted.push(entry);
    return Promise.resolve();
  }
}

describe("runtime audit repository", () => {
  it("can persist audit entries through the Prisma runtime repository", async () => {
    const prisma = new CapturingPrismaAuditService();
    const writer = new AuditLogWriter(new PrismaAuditLogRepository(prisma as unknown as PrismaService));

    const entry = await writer.writeAsync({
      actor: { actorId: "admin", roles: ["super_admin"], mfaVerified: true },
      action: "runtime.audit.persistence_test",
      targetType: "AuditLog",
      targetId: "runtime",
      result: "success",
      context: {}
    });

    expect(writer.runtimeMode).toBe("durable-boundary");
    expect(writer.repository.mode).toBe("prisma-runtime");
    expect(prisma.persisted).toEqual([entry]);
  });
});
