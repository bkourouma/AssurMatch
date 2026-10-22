import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditLogRepository } from "../../../src/modules/audit-logs/audit-log-repository";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { auditReliability, renderAuditMetrics } from "../../../src/modules/observability/audit-metrics";
import { setLogSink, type LogEntry } from "../../../src/modules/observability/structured-logger";
import type { AuditEntry } from "../../../src/modules/common/types";

function flakyRepository(failures: number) {
  const stored: AuditEntry[] = [];
  let remaining = failures;
  const repository: AuditLogRepository = {
    mode: "prisma-runtime",
    persist: async (entry) => {
      if (remaining > 0) {
        remaining -= 1;
        throw new Error("connection refused for alice@example.com");
      }
      stored.push(entry);
    }
  };
  return { repository, stored };
}

const input = { action: "user.login.succeeded", targetType: "User", targetId: "u-1", result: "success" as const, context: { email: "alice@example.com", phone: "+22507070707" } };
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("AuditLogWriter reliability (spec 075 FR-B1)", () => {
  let logs: LogEntry[];
  beforeEach(() => {
    auditReliability.reset();
    logs = [];
    setLogSink((entry) => logs.push(entry));
  });
  afterEach(() => setLogSink(undefined));

  it("logs, counts and retries a failed write() until it is stored", async () => {
    const { repository, stored } = flakyRepository(2);
    const writer = new AuditLogWriter(repository, { retryBaseMs: 100_000 });

    writer.write(input);
    await flush();
    expect(writer.outboxDepth).toBe(1);
    expect(auditReliability.snapshot()).toMatchObject({ auditPersistFailures: 1, auditOutboxDepth: 1, auditDropped: 0 });

    expect(await writer.drain()).toBe(1); // second failure
    expect(auditReliability.snapshot().auditPersistFailures).toBe(2);
    expect(await writer.drain()).toBe(0); // stored
    expect(stored).toHaveLength(1);
    expect(auditReliability.snapshot()).toMatchObject({ auditOutboxDepth: 0, auditDropped: 0 });
  });

  it("logs the failure without context, identifier, PII or error message", async () => {
    const { repository } = flakyRepository(1);
    const writer = new AuditLogWriter(repository, { retryBaseMs: 100_000 });
    writer.write(input);
    await flush();
    const failure = logs.find((entry) => entry.event === "audit.persist_failed");
    expect(failure).toMatchObject({ level: "error", action: "user.login.succeeded", targetType: "User", errorName: "Error" });
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain("alice");
    expect(serialised).not.toContain("0707");
    expect(serialised).not.toContain("connection refused");
    expect(serialised).not.toContain("u-1");
    await writer.drain();
  });

  it("drops the oldest entry when the outbox overflows and counts it", async () => {
    const { repository, stored } = flakyRepository(3);
    const writer = new AuditLogWriter(repository, { outboxMax: 2, retryBaseMs: 100_000 });
    writer.write({ ...input, targetId: "first" });
    writer.write({ ...input, targetId: "second" });
    writer.write({ ...input, targetId: "third" });
    await flush();
    expect(writer.outboxDepth).toBe(2);
    expect(auditReliability.snapshot()).toMatchObject({ auditPersistFailures: 3, auditDropped: 1, auditOutboxDepth: 2 });
    expect(logs.some((entry) => entry.event === "audit.dropped" && entry.level === "error")).toBe(true);
    await writer.drain();
    expect(stored.map((entry) => entry.targetId)).toEqual(["second", "third"]);
  });

  it("writeAsync rejects and never feeds the outbox", async () => {
    const { repository } = flakyRepository(1);
    const writer = new AuditLogWriter(repository);
    await expect(writer.writeAsync(input)).rejects.toThrow();
    expect(writer.outboxDepth).toBe(0);
    expect(auditReliability.snapshot().auditPersistFailures).toBe(0);
  });

  it("keeps the memory-test behaviour: nothing queued, nothing counted", async () => {
    const writer = new AuditLogWriter();
    writer.write(input);
    await flush();
    expect(writer.outboxDepth).toBe(0);
    expect(writer.all()).toHaveLength(1);
    expect(auditReliability.snapshot()).toEqual({ auditPersistFailures: 0, auditOutboxDepth: 0, auditDropped: 0 });
  });

  it("renders the counters for /metrics", () => {
    auditReliability.recordPersistFailure();
    expect(renderAuditMetrics().join("\n")).toContain("assurmatch_audit_persist_failures_total 1");
  });
});
