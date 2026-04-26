import { describe, expect, it } from "vitest";
import { QueuesModule } from "../../../src/modules/common/queues/queues.module";

function withEnv<T>(env: Record<string, string | undefined>, callback: () => T): T {
  const previous = { ...process.env };
  process.env = { ...previous, ...env };
  try {
    return callback();
  } finally {
    process.env = previous;
  }
}

describe("runtime BullMQ queues", () => {
  it("binds BullMQ queue ports outside tests when Redis is configured", () => {
    withEnv({
      NODE_ENV: "local",
      APP_ENV: "local",
      DATABASE_URL: "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      REDIS_URL: "redis://localhost:6379"
    }, () => {
      const queues = new QueuesModule();
      const job = queues.notifications.add("visitor-quote-notifications", "visitor_quote_notification", "quote-1", "corr-1");

      expect(queues.runtimeMode).toBe("bullmq");
      expect(queues.notifications.mode).toBe("bullmq");
      expect(job.payloadReference).toBe("quote-1");
    });
  });
});
