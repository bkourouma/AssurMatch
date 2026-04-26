import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime memory boundaries", () => {
  it("keeps memory adapters declared as test-only constructs", () => {
    const redisModule = readFileSync(join(process.cwd(), "backend", "src", "modules", "common", "redis", "redis.module.ts"), "utf8");
    const queueModule = readFileSync(join(process.cwd(), "backend", "src", "modules", "common", "queues", "queues.module.ts"), "utf8");
    const auditWriter = readFileSync(join(process.cwd(), "backend", "src", "modules", "audit-logs", "audit-log-writer.service.ts"), "utf8");

    expect(redisModule).toContain('readonly mode = "memory-test"');
    expect(queueModule).toContain('readonly mode = "memory-test"');
    expect(auditWriter).toContain("Memory audit repository is test-only");
  });
});
