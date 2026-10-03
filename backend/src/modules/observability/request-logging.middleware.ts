import { randomUUID } from "node:crypto";
import { CORRELATION_ID_HEADER } from "../common/middleware/correlation-id.middleware";
import { httpMetrics, type HttpMetricsRegistry } from "./http-metrics";
import { logEvent } from "./structured-logger";

/**
 * Spec 058 FR-001 / FR-003: one `http.request` log line and one metrics sample per response.
 *
 * - The route is the matched Express template (`/leads/:id`), never the raw URL: identifiers,
 *   visitor tokens and query strings cannot reach the logs or the metric labels. A request that
 *   matched no route is recorded as `unmatched`.
 * - Every request carries a correlationId: a well-formed incoming `x-correlation-id` is kept,
 *   anything else is replaced, and the value is echoed in the response header. The error filter
 *   reads the same header, so a 5xx body, its log line and its error report share one id.
 */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

interface MiddlewareRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  baseUrl?: string;
  route?: { path?: unknown };
}

interface MiddlewareResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  once(event: "finish" | "close", listener: () => void): unknown;
}

export function ensureCorrelationId(request: MiddlewareRequest): string {
  const raw = request.headers[CORRELATION_ID_HEADER];
  const incoming = Array.isArray(raw) ? raw[0] : raw;
  const correlationId = incoming && CORRELATION_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  request.headers[CORRELATION_ID_HEADER] = correlationId;
  return correlationId;
}

export function routeTemplate(request: Pick<MiddlewareRequest, "baseUrl" | "route">): string {
  const path = request.route?.path;
  if (typeof path !== "string") return "unmatched";
  const template = `${request.baseUrl ?? ""}${path}`;
  return template.length > 0 ? template : "/";
}

export function createRequestLoggingMiddleware(metrics: HttpMetricsRegistry = httpMetrics) {
  return (request: MiddlewareRequest, response: MiddlewareResponse, next: () => void): void => {
    const started = process.hrtime.bigint();
    const correlationId = ensureCorrelationId(request);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    let done = false;
    const finish = (aborted: boolean) => {
      if (done) return;
      done = true;
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = routeTemplate(request);
      const method = (request.method ?? "GET").toUpperCase();
      const status = aborted ? 499 : response.statusCode;
      // `/metrics` scrapes would otherwise dominate both the log and the request counters.
      if (route === "/metrics") return;
      metrics.recordRequest(method, route, status, durationSeconds);
      const probe = route === "/healthz" || route === "/readyz";
      logEvent(status >= 500 ? "error" : status >= 400 ? "warn" : probe ? "debug" : "info", "http.request", {
        correlationId,
        method,
        route,
        status,
        durationMs: Math.round(durationSeconds * 1000 * 10) / 10
      });
    };
    response.once("finish", () => finish(false));
    response.once("close", () => finish(true));
    next();
  };
}
