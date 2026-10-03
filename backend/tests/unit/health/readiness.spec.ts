import { describe, expect, it } from "vitest";
import { checkReadiness, databaseProbe, redisProbe, runProbe } from "../../../src/modules/health/readiness";

describe("readiness probes (spec 057)", () => {
  it("is ready only when every probe answers ok", async () => {
    expect(await checkReadiness({ database: async () => "ok", redis: async () => "ok" })).toEqual({
      status: "ready",
      checks: { database: "ok", redis: "ok" }
    });
    expect(await checkReadiness({ database: async () => "ok", redis: async () => "degraded" })).toEqual({
      status: "not_ready",
      checks: { database: "ok", redis: "down" }
    });
  });

  it("maps exceptions, synchronous throws and timeouts to down", async () => {
    expect(await runProbe(async () => { throw new Error("password authentication failed for user x"); })).toBe("down");
    expect(await runProbe(() => { throw new Error("sync"); })).toBe("down");
    expect(await runProbe(() => new Promise(() => undefined), 20)).toBe("down");
  });

  it("queries the real pool with SELECT 1 and fails closed without a connected client", async () => {
    const queries: string[] = [];
    const connected = databaseProbe({ runtimeMode: "prisma-client", runtimeClient: { $queryRawUnsafe: async (sql: string) => { queries.push(sql); return [{ "?column?": 1 }]; } } as never });
    expect(await runProbe(connected)).toBe("ok");
    expect(queries).toEqual(["SELECT 1"]);
    expect(await runProbe(databaseProbe({ runtimeMode: "prisma-client", runtimeClient: undefined }))).toBe("down");
    expect(await runProbe(databaseProbe({ runtimeMode: "test-adapter", runtimeClient: undefined }))).toBe("ok");
  });

  it("uses the Redis client health ping", async () => {
    expect(await runProbe(redisProbe({ health: async () => "ok" }))).toBe("ok");
    expect(await runProbe(redisProbe({ health: async () => "down" }))).toBe("down");
  });
});
