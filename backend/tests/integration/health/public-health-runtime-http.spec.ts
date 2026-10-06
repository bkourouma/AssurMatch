import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("public health probes (spec 057, PRD K-10)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
  });

  it("answers liveness without authentication and with nothing but a status", async () => {
    harness = await createRuntimeHttpHarness();
    const response = await harness.request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("answers readiness with the database and Redis states only", async () => {
    harness = await createRuntimeHttpHarness();
    const response = await harness.request("/readyz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", checks: { database: "ok", redis: "ok" } });
  });

  it("returns 503 without leaking the failure when a dependency is down", async () => {
    harness = await createRuntimeHttpHarness();
    vi.spyOn(harness.runtime.redis.client, "health").mockRejectedValue(new Error("connect ECONNREFUSED redis.internal:6379"));
    const response = await harness.request("/readyz");
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "not_ready", checks: { database: "ok", redis: "down" } });
    expect(text).not.toMatch(/ECONNREFUSED|redis\.internal|6379/);
  });

  it("keeps the detailed system health behind authentication", async () => {
    harness = await createRuntimeHttpHarness();
    expect((await harness.request("/admin/system/health")).status).toBe(401);
  });
});
