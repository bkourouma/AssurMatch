import { describe, expect, it } from "vitest";
import { DeliveryWorkerLoop, describeError, numericCounters, readIntegerEnv, type WorkerLogEvent } from "../../../src/runtime/worker/delivery-worker-loop";

describe("delivery worker loop (spec 057, PRD I-01)", () => {
  it("runs every enabled task, isolates a failure and logs counters only", async () => {
    const logs: WorkerLogEvent[] = [];
    const ran: string[] = [];
    const loop = new DeliveryWorkerLoop({
      intervalMs: 1000,
      log: (event) => logs.push(event),
      tasks: [
        { name: "failing", enabled: true, run: async () => { ran.push("failing"); throw new Error("boom for visiteur@example.com\nstack line"); } },
        { name: "quote-notifications", enabled: true, run: async () => { ran.push("quote"); return { due: 2, sent: 1, outcomes: [{ id: "notif-1", recipient: "visiteur@example.com" }] }; } },
        { name: "partner-webhooks", enabled: false, run: async () => { ran.push("webhooks"); return {}; } }
      ]
    });

    const outcomes = await loop.runCycle();

    expect(ran).toEqual(["failing", "quote"]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["error", "ok", "skipped"]);
    expect(outcomes[1]?.counters).toEqual({ due: 2, sent: 1 });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("notif-1");
    expect(serialized).not.toContain("stack line");
    expect(logs.find((event) => event.event === "worker.task.failed")?.level).toBe("error");
    expect(loop.cycleCount).toBe(1);
  });

  it("reloads state before each cycle and skips the cycle if that fails", async () => {
    let prepared = 0;
    let ran = 0;
    let beats = 0;
    const loop = new DeliveryWorkerLoop({
      intervalMs: 1000,
      log: () => undefined,
      heartbeat: () => { beats += 1; },
      beforeCycle: async () => { prepared += 1; if (prepared === 1) throw new Error("db down"); },
      tasks: [{ name: "t", enabled: true, run: async () => { ran += 1; return {}; } }]
    });
    await loop.runCycle();
    await loop.runCycle();
    expect(prepared).toBe(2);
    expect(ran).toBe(1);
    expect(beats).toBe(2);
  });

  it("finishes the in-flight cycle on stop and never overlaps cycles", async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const loop = new DeliveryWorkerLoop({
      intervalMs: 5,
      log: () => undefined,
      tasks: [{
        name: "slow",
        enabled: true,
        run: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          runs += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
          if (runs === 3) loop.stop();
          return {};
        }
      }]
    });
    await loop.run();
    expect(runs).toBe(3);
    expect(maxActive).toBe(1);
    expect(loop.isStopping).toBe(true);
  });

  it("wakes up from the sleep immediately when stopped", async () => {
    const loop = new DeliveryWorkerLoop({ intervalMs: 60_000, log: () => undefined, tasks: [] });
    const running = loop.run();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const started = Date.now();
    loop.stop();
    await running;
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("keeps numeric fields only and truncates errors to one line", () => {
    expect(numericCounters({ a: 1, b: "x", c: [1], d: Number.NaN, e: 0 })).toEqual({ a: 1, e: 0 });
    expect(numericCounters(undefined)).toEqual({});
    expect(describeError(new TypeError("first\nsecond"))).toBe("TypeError: first");
    expect(describeError("x".repeat(500)).length).toBeLessThanOrEqual(163);
  });

  it("validates integer environment settings", () => {
    expect(readIntegerEnv({}, "K", 30, 5, 3600)).toBe(30);
    expect(readIntegerEnv({ K: "60" }, "K", 30, 5, 3600)).toBe(60);
    expect(() => readIntegerEnv({ K: "1" }, "K", 30, 5, 3600)).toThrow(/K must be/);
    expect(() => readIntegerEnv({ K: "abc" }, "K", 30, 5, 3600)).toThrow(/K must be/);
    expect(() => new DeliveryWorkerLoop({ intervalMs: 0, tasks: [] })).toThrow();
  });
});
