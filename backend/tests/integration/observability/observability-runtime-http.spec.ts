import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorReporter, parseDsn, setErrorReporter, type FetchLike } from "../../../src/modules/observability/error-reporter";
import { httpMetrics } from "../../../src/modules/observability/http-metrics";
import { setLogSink, type LogEntry } from "../../../src/modules/observability/structured-logger";
import { WORKER_STATUS_KEY } from "../../../src/runtime/worker/worker-status";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const PII = /visitor@example\.com|\+22507000000|eyJhbGciOiJIUzI1NiJ9|s3cr3t-reset|Bearer abc/;

describe("structured request and error logs (spec 058 FR-001 / FR-002)", () => {
  let harness: RuntimeHttpHarness | undefined;
  let entries: LogEntry[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    setLogSink(undefined);
    setErrorReporter(undefined);
    await harness?.close();
    harness = undefined;
    entries = [];
  });

  it("logs one masked JSON line per request with the route template, never the URL or the query", async () => {
    setLogSink((entry) => entries.push(entry));
    harness = await createRuntimeHttpHarness();
    const response = await harness.request("/countries/ZZ?token=s3cr3t-reset&email=visitor@example.com", { headers: { "x-correlation-id": "corr-058-a" } });
    expect(response.headers.get("x-correlation-id")).toBe("corr-058-a");
    const line = entries.find((entry) => entry.event === "http.request");
    expect(line).toMatchObject({ level: expect.any(String), method: "GET", route: "/countries/:countryCode", status: response.status, correlationId: "corr-058-a" });
    expect(typeof line?.durationMs).toBe("number");
    expect(JSON.stringify(entries)).not.toMatch(PII);
    expect(JSON.stringify(entries)).not.toContain("ZZ?");
  });

  it("replaces a malformed incoming correlationId instead of logging it", async () => {
    setLogSink((entry) => entries.push(entry));
    harness = await createRuntimeHttpHarness();
    const response = await harness.request("/healthz", { headers: { "x-correlation-id": "bad id\" injected" } });
    const echoed = response.headers.get("x-correlation-id") ?? "";
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs every 5xx with its correlationId and a masked stack, reports it, and keeps the body safe", async () => {
    setLogSink((entry) => entries.push(entry));
    const sent: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      sent.push({ url, body: init.body, headers: init.headers });
      return { ok: true, status: 200 };
    };
    setErrorReporter(new ErrorReporter(parseDsn("https://publickey@errors.example.org/42"), fetchImpl, 30, { NODE_ENV: "test" }));
    harness = await createRuntimeHttpHarness();
    await harness.runtime.featureFlags.service.setFlag({ key: "public_comparator_enabled", scopeType: "global", value: true, reason: "spec 058 test" }, { actorId: "admin-058", roles: ["super_admin"], mfaVerified: true });
    vi.spyOn(harness.runtime.countries.service, "listPublic").mockImplementation(() => {
      throw new Error("pool exhausted for visitor@example.com +22507000000 Bearer abc.def eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig ?token=s3cr3t-reset");
    });

    const response = await harness.request("/countries?token=s3cr3t-reset", { headers: { "x-correlation-id": "corr-058-500" } });
    expect(response.status).toBe(500);
    const body = await response.json() as Record<string, unknown>;
    expect(body.correlationId).toBe("corr-058-500");
    expect(JSON.stringify(body)).not.toMatch(/at |\.ts:/);

    const error = entries.find((entry) => entry.event === "http.error");
    expect(error).toMatchObject({ level: "error", correlationId: "corr-058-500", route: "/countries", status: 500, method: "GET" });
    expect(String(error?.stack)).toMatch(/at /);
    expect(entries.find((entry) => entry.event === "http.request")).toMatchObject({ status: 500, correlationId: "corr-058-500" });
    expect(JSON.stringify(entries)).not.toMatch(PII);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.url).toBe("https://errors.example.org/api/42/envelope/");
    expect(sent[0]?.headers["x-sentry-auth"]).toContain("sentry_key=publickey");
    expect(sent[0]?.body).toContain("corr-058-500");
    expect(sent[0]?.body).toContain("\"route\":\"/countries\"");
    expect(sent[0]?.body).not.toMatch(PII);
  });

  it("does not log 4xx as errors nor report them", async () => {
    setLogSink((entry) => entries.push(entry));
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: true, status: 200 }));
    setErrorReporter(new ErrorReporter(parseDsn("https://k@errors.example.org/1"), fetchImpl));
    harness = await createRuntimeHttpHarness();
    expect((await harness.request("/admin/system/health")).status).toBe(401);
    expect(entries.some((entry) => entry.event === "http.error")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Prometheus metrics endpoint (spec 058 FR-003)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const saved = process.env.METRICS_TOKEN;
  const token = "metrics-token-for-tests-0123456789";

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    if (saved === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = saved;
  });

  it("does not exist when METRICS_TOKEN is not configured", async () => {
    delete process.env.METRICS_TOKEN;
    harness = await createRuntimeHttpHarness();
    expect((await harness.request("/metrics")).status).toBe(404);
    expect((await harness.request("/metrics", { headers: { authorization: "Bearer anything" } })).status).toBe(404);
  });

  it("requires the bearer token and answers the same 401 for a missing and a wrong one", async () => {
    process.env.METRICS_TOKEN = token;
    harness = await createRuntimeHttpHarness();
    const missing = await harness.request("/metrics");
    const wrong = await harness.request("/metrics", { headers: { authorization: "Bearer metrics-token-for-tests-WRONG56789" } });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect((await missing.json() as { code: string }).code).toBe((await wrong.json() as { code: string }).code);
  });

  it("exposes request, error, latency and worker series with route templates only", async () => {
    process.env.METRICS_TOKEN = token;
    httpMetrics.reset();
    harness = await createRuntimeHttpHarness();
    await harness.runtime.redis.client.set(WORKER_STATUS_KEY, JSON.stringify({
      lastCycleAt: new Date(Date.now() - 30_000).toISOString(),
      notificationsBacklog: 4,
      taskFailuresTotal: { "quote-notifications": 2 },
      taskErrorsTotal: {}
    }));
    await harness.request("/countries/CI?token=s3cr3t-reset");
    await harness.request("/healthz");

    const response = await harness.request("/metrics", { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain('assurmatch_http_requests_total{method="GET",route="/countries/:countryCode",status=');
    expect(text).toContain('assurmatch_http_requests_total{method="GET",route="/healthz",status="200"} 1');
    expect(text).toContain("# TYPE assurmatch_http_request_duration_seconds histogram");
    expect(text).toContain("# TYPE assurmatch_http_request_errors_total counter");
    expect(text).toMatch(/assurmatch_worker_last_cycle_age_seconds (29|30|31|32)\n/);
    expect(text).toContain("assurmatch_notifications_backlog 4");
    expect(text).toContain('assurmatch_worker_task_failures_total{task="quote-notifications"} 2');
    expect(text).not.toMatch(/s3cr3t|token=|\/countries\/CI/);
    // Scrapes are not counted as traffic.
    expect(text).not.toContain('route="/metrics"');
  });
});
