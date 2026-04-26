import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../src/modules/audit-logs/audit-log-writer.service";
import { PrismaService } from "../../src/modules/common/prisma/prisma.service";
import { QueuesModule } from "../../src/modules/common/queues/queues.module";
import { RedisModule } from "../../src/modules/common/redis/redis.module";

describe("runtime adapter boundaries", () => {
  it("keeps memory adapters explicit in test mode", () => {
    expect(new PrismaService().runtimeMode).toBe("test-adapter");
    expect(new RedisModule().runtimeMode).toBe("memory-test");
    expect(new QueuesModule().runtimeMode).toBe("memory-test");
    expect(new AuditLogWriter().runtimeMode).toBe("memory-test");
  });
});
