import { describe, expect, it } from "vitest";
import { maskText } from "../../../src/modules/common/logging/pii-masker";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { buildErrorEvent, ErrorReporter, parseDsn, type FetchLike } from "../../../src/modules/observability/error-reporter";
import { HttpMetricsRegistry } from "../../../src/modules/observability/http-metrics";
import { routeTemplate } from "../../../src/modules/observability/request-logging.middleware";
import { logEvent, maskLogValue, setLogSink, type LogEntry } from "../../../src/modules/observability/structured-logger";
import { DeliveryWorkerLoop } from "../../../src/runtime/worker/delivery-worker-loop";
import { readWorkerStatus, recordWorkerCycle } from "../../../src/runtime/worker/worker-status";

describe("maskText (spec 058 FR-001)", () => {
  it("masks e-mails, phones, UUIDs, bearer credentials, JWTs and secret query parameters", () => {
    const input = "GET /suivi?ref=AM-1&token=abcDEF123_-xyz&lang=fr by jane@example.com +22507000000 id 0f8fad5b-d9cb-469f-a165-70867728950e Authorization: Bearer abc.def-ghi jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln";
    const masked = maskText(input);
    expect(masked).toContain("token=[masked]&lang=fr");
    expect(masked).toContain("ref=AM-1");
    expect(masked).not.toMatch(/abcDEF123|jane@example\.com|\+22507000000|0f8fad5b|abc\.def-ghi|eyJhbGci/);
    expect(masked).toContain("Bearer [masked]");
    expect(masked).toContain("[masked-jwt]");
  });

  it("masks access_token, code and signature parameters too", () => {
    expect(maskText("/cb?code=123456&state=x&access_token=zz&signature=ff")).toBe("/cb?code=[masked]&state=x&access_token=[masked]&signature=[masked]");
  });
});

describe("maskLogValue / logEvent (spec 058 FR-001)", () => {
  it("replaces sensitive keys whatever their value, recursively", () => {
    const masked = maskLogValue({
      password: "x", newPassword: "y", authorization: "Bearer z", cookie: "s=1", apiKey: "k", backupCodes: ["1"],
      nested: { accessToken: "t", resetToken: "r", email: "a@b.co", note: "call +22507000000" },
      count: 3
    });
    expect(masked).toEqual({
      password: "[masked]", newPassword: "[masked]", authorization: "[masked]", cookie: "[masked]", apiKey: "[masked]", backupCodes: "[masked]",
      nested: { accessToken: "[masked]", resetToken: "[masked]", email: "[masked]", note: "call [masked-phone]" },
      count: 3
    });
  });

  it("writes masked entries to the installed sink and honours LOG_LEVEL", () => {
    const entries: LogEntry[] = [];
    setLogSink((entry) => entries.push(entry));
    const previous = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = "warn";
      logEvent("info", "ignored", {});
      logEvent("error", "kept", { message: "failure for jane@example.com" });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ level: "error", event: "kept", message: "failure for [masked-email]" });
      expect(typeof entries[0]?.at).toBe("string");
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
      setLogSink(undefined);
    }
  });

  it("uses the matched route template and groups unmatched requests", () => {
    expect(routeTemplate({ baseUrl: "", route: { path: "/leads/:id" } })).toBe("/leads/:id");
    expect(routeTemplate({})).toBe("unmatched");
  });
});

describe("error reporter (spec 058 FR-002)", () => {
  it("is disabled without a valid DSN", () => {
    expect(parseDsn(undefined)).toBeUndefined();
    expect(parseDsn("not a url")).toBeUndefined();
    expect(parseDsn("https://errors.example.org/42")).toBeUndefined();
    expect(new ErrorReporter(undefined).enabled).toBe(false);
  });

  it("parses SaaS and self-hosted DSNs", () => {
    expect(parseDsn("https://abc@o1.ingest.sentry.io/123")).toMatchObject({ envelopeUrl: "https://o1.ingest.sentry.io/api/123/envelope/", publicKey: "abc" });
    expect(parseDsn("https://abc@glitchtip.internal/prefix/7")).toMatchObject({ envelopeUrl: "https://glitchtip.internal/prefix/api/7/envelope/" });
  });

  it("builds an allow-listed, masked event", () => {
    const error = new Error("lookup failed for jane@example.com ?token=abc");
    const event = buildErrorEvent(error, { correlationId: "c-1", route: "/auth/login", method: "POST", status: 500 }, { NODE_ENV: "production", APP_ENV: "production", SENTRY_RELEASE: "1.2.3" });
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/jane@example\.com|token=abc/);
    expect(event).toMatchObject({ environment: "production", release: "1.2.3", tags: { route: "/auth/login", method: "POST", status: "500" }, extra: { correlationId: "c-1" } });
    expect(event.exception.values[0]?.stacktrace.frames.length).toBeGreaterThan(0);
    expect(Object.keys(event)).not.toEqual(expect.arrayContaining(["request", "user"]));
  });

  it("caps the number of events per minute and swallows transport failures", async () => {
    let calls = 0;
    const failing: FetchLike = async () => {
      calls += 1;
      throw new Error("network down");
    };
    const reporter = new ErrorReporter(parseDsn("https://k@errors.example.org/1"), failing, 2);
    await reporter.report(new Error("a"));
    await reporter.report(new Error("b"));
    await reporter.report(new Error("c"));
    expect(calls).toBe(2);
  });
});

describe("metrics registry and worker status (spec 058 FR-003)", () => {
  it("renders counters and a cumulative histogram", () => {
    const registry = new HttpMetricsRegistry();
    registry.recordRequest("get", "/leads/:id", 200, 0.02);
    registry.recordRequest("GET", "/leads/:id", 503, 3);
    const text = registry.render({ taskFailuresTotal: {}, taskErrorsTotal: {} });
    expect(text).toContain('assurmatch_http_requests_total{method="GET",route="/leads/:id",status="200"} 1');
    expect(text).toContain('assurmatch_http_request_errors_total{method="GET",route="/leads/:id"} 1');
    expect(text).toContain('assurmatch_http_request_duration_seconds_bucket{method="GET",route="/leads/:id",le="0.025"} 1');
    expect(text).toContain('assurmatch_http_request_duration_seconds_bucket{method="GET",route="/leads/:id",le="+Inf"} 2');
    // No worker snapshot yet: the gauges are declared without a sample.
    expect(text).not.toMatch(/^assurmatch_worker_last_cycle_age_seconds \d/m);
  });

  it("accumulates worker failures and publishes the backlog", async () => {
    const redis = new InMemoryRedisClient();
    await recordWorkerCycle(redis, [
      { task: "quote-notifications", status: "ok", counters: { due: 7, sent: 3, failed: 1 } },
      { task: "satisfaction-surveys", status: "error" }
    ], new Date("2026-10-03T10:00:00Z"));
    await recordWorkerCycle(redis, [{ task: "quote-notifications", status: "ok", counters: { due: 2, sent: 2, failed: 2 } }], new Date("2026-10-03T10:00:30Z"));
    expect(await readWorkerStatus(redis)).toEqual({
      lastCycleAt: "2026-10-03T10:00:30.000Z",
      notificationsBacklog: 0,
      taskFailuresTotal: { "quote-notifications": 3 },
      taskErrorsTotal: { "satisfaction-surveys": 1 }
    });
  });

  it("calls afterCycle with the outcomes and survives its failure", async () => {
    const seen: unknown[] = [];
    const events: Array<Record<string, unknown>> = [];
    const loop = new DeliveryWorkerLoop({
      intervalMs: 1000,
      tasks: [{ name: "t", enabled: true, run: async () => ({ due: 1, recipient: "x@example.com" }) }],
      afterCycle: (outcomes) => {
        seen.push(outcomes);
        throw new Error("redis down");
      },
      log: (event) => events.push(event)
    });
    await loop.runCycle();
    expect(seen).toEqual([[{ task: "t", status: "ok", counters: { due: 1 } }]]);
    expect(events.some((event) => event.event === "worker.status.publish_failed")).toBe(true);
  });
});
