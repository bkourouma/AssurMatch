import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../src/modules/audit-logs/audit-log-writer.service";
import { PrismaService } from "../../src/modules/common/prisma/prisma.service";
import { QueuesModule } from "../../src/modules/common/queues/queues.module";
import { RedisModule } from "../../src/modules/common/redis/redis.module";

function withEnv<T>(env: Record<string, string | undefined>, callback: () => T): T {
  const previous = { ...process.env };
  process.env = { ...previous, ...env };
  try {
    return callback();
  } finally {
    process.env = previous;
  }
}

describe("runtime adapter boundaries", () => {
  it("keeps memory adapters explicit in test mode", () => {
    expect(new PrismaService().runtimeMode).toBe("test-adapter");
    expect(new RedisModule().runtimeMode).toBe("memory-test");
    expect(new QueuesModule().runtimeMode).toBe("memory-test");
    expect(new AuditLogWriter().runtimeMode).toBe("memory-test");
  });

  it("selects real runtime adapters outside tests when required URLs are configured", () => {
    withEnv({
      NODE_ENV: "local",
      APP_ENV: "local",
      DATABASE_URL: "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      REDIS_URL: "redis://localhost:6379",
      ASSURMATCH_PRISMA_MEMORY: "false",
      ASSURMATCH_REDIS_MEMORY: "false",
      ASSURMATCH_QUEUE_MEMORY: "false"
    }, () => {
      expect(new PrismaService().runtimeMode).toBe("prisma-client");
      expect(new RedisModule().runtimeMode).toBe("redis-client");
      expect(new RedisModule().client.mode).toBe("redis-client");
      expect(new QueuesModule().runtimeMode).toBe("bullmq");
      expect(new QueuesModule().notifications.mode).toBe("bullmq");
    });
  });

  it("rejects memory adapter overrides outside tests", () => {
    withEnv({
      NODE_ENV: "local",
      APP_ENV: "local",
      DATABASE_URL: "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      REDIS_URL: "redis://localhost:6379",
      ASSURMATCH_REDIS_MEMORY: "true"
    }, () => {
      expect(() => new RedisModule()).toThrow(/Memory runtime adapters are test-only/);
      expect(() => new QueuesModule()).toThrow(/Memory runtime adapters are test-only/);
    });
  });
});
