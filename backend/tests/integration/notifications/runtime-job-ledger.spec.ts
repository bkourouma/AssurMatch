import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProcessJobLedger, QueuesModule } from "../../../src/modules/common/queues/queues.module";

async function withEnv<T>(env: Record<string, string | undefined>, callback: () => T | Promise<T>): Promise<T> {
  const previous = { ...process.env };
  process.env = { ...previous, ...env };
  try {
    return await callback();
  } finally {
    process.env = previous;
  }
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("runtime job ledger (spec 057, decision D-7)", () => {
  it("binds the process ledger outside tests and never opens a BullMQ queue", async () => {
    await withEnv({
      NODE_ENV: "local",
      APP_ENV: "local",
      DATABASE_URL: "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
      REDIS_URL: "redis://localhost:6379"
    }, async () => {
      const queues = new QueuesModule();
      const job = queues.notifications.add("visitor-quote-notifications", "visitor_quote_notification", "quote-1", "corr-1");

      expect(queues.runtimeMode).toBe("process-ledger");
      expect(queues.notifications.mode).toBe("process-ledger");
      expect(job.payloadReference).toBe("quote-1");
      expect(queues.notifications.transition(job.id, "completed").status).toBe("completed");
      await queues.close();
    });
  });

  it("stays bounded and evicts finished jobs before running ones", () => {
    const ledger = new ProcessJobLedger(3);
    const running = ledger.add("q", "t", "running");
    const done = ledger.add("q", "t", "done");
    ledger.transition(done.id, "completed");
    ledger.add("q", "t", "third");
    ledger.add("q", "t", "fourth");

    expect(ledger.list()).toHaveLength(3);
    expect(ledger.list().map((job) => job.payloadReference)).toEqual(["running", "third", "fourth"]);
    expect(ledger.transition(running.id, "active").status).toBe("active");
  });

  it("keeps no BullMQ producer anywhere in the backend source", () => {
    const root = join(process.cwd(), "backend", "src");
    const offenders = sourceFiles(root).filter((file) => /from\s+["']bullmq["']/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
