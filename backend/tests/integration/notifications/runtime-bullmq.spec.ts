import { describe, expect, it } from "vitest";
import { QueuesModule } from "../../../src/modules/common/queues/queues.module";

async function withEnv<T>(env: Record<string, string | undefined>, callback: () => T | Promise<T>): Promise<T> {
  const previous = { ...process.env };
  process.env = { ...previous, ...env };
  try {
    return await callback();
  } finally {
    process.env = previous;
  }
}

describe("runtime BullMQ queues", () => {
  it("binds BullMQ queue ports outside tests when Redis is configured", async () => {
    await withEnv({
      NODE_ENV: "local",
      APP_ENV: "local",
      DATABASE_URL: "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      REDIS_URL: "redis://localhost:6379"
    }, async () => {
      const queues = new QueuesModule();
      try {
        const job = queues.notifications.add("visitor-quote-notifications", "visitor_quote_notification", "quote-1", "corr-1");

        expect(queues.runtimeMode).toBe("bullmq");
        expect(queues.notifications.mode).toBe("bullmq");
        expect(job.payloadReference).toBe("quote-1");
      } finally {
        await Promise.all(Object.values(queues.bullQueues ?? {}).map((queue) => queue.close().catch(() => undefined)));
      }
    });
  });
});
