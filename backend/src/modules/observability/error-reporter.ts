import { randomUUID } from "node:crypto";
import { maskText } from "../common/logging/pii-masker";
import { logEvent, maskLogValue } from "./structured-logger";

/**
 * Spec 058 FR-002: optional error tracking through the Sentry envelope protocol (Sentry, GlitchTip,
 * Bugsink...), without the SDK. The SDK instruments HTTP automatically and attaches headers, bodies
 * and IP addresses by default; here the event is built from an allow-list and then masked again:
 *
 *   sent  : exception type, masked message, stack frames (file, function, line), route template,
 *           method, status, correlationId, environment, release;
 *   never : request body, headers, cookies, query string, IP address, user, local variables.
 *
 * Disabled when SENTRY_DSN is absent or malformed. At most `maxPerMinute` events, 2 s timeout,
 * failures swallowed (logged without the DSN).
 */
export interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
  dsn: string;
}

export interface ErrorReportContext {
  correlationId?: string;
  route?: string;
  method?: string;
  status?: number;
  source?: string;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

export function parseDsn(dsn: string | undefined): ParsedDsn | undefined {
  if (!dsn?.trim()) return undefined;
  try {
    const url = new URL(dsn.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    if (!url.username || !projectId || !/^\d+$/.test(projectId)) return undefined;
    const prefix = url.pathname.split("/").filter(Boolean).slice(0, -1).join("/");
    const base = `${url.protocol}//${url.host}${prefix ? `/${prefix}` : ""}`;
    return { envelopeUrl: `${base}/api/${projectId}/envelope/`, publicKey: decodeURIComponent(url.username), dsn: dsn.trim() };
  } catch {
    return undefined;
  }
}

interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
}

export function stackFrames(error: unknown, max = 30): StackFrame[] {
  if (!(error instanceof Error) || !error.stack) return [];
  const frames: StackFrame[] = [];
  for (const line of error.stack.split(/\r?\n/)) {
    const match = line.match(/^\s+at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    frames.push({
      ...(match[1] ? { function: maskText(match[1]) } : {}),
      filename: maskText(match[2] ?? "").replace(/^.*\/(backend|scripts|packages|node_modules)\//, "$1/"),
      lineno: Number(match[3]),
      colno: Number(match[4])
    });
    if (frames.length >= max) break;
  }
  // Sentry expects the outermost frame first.
  return frames.reverse();
}

export function buildErrorEvent(error: unknown, context: ErrorReportContext, env: Record<string, string | undefined> = process.env, now = new Date()) {
  const type = error instanceof Error ? error.name : "Error";
  const value = error instanceof Error ? error.message : String(error);
  const event = {
    event_id: randomUUID().replace(/-/g, ""),
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    logger: "assurmatch-api",
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.APP_ENV?.trim() || env.NODE_ENV || "unknown",
    ...(env.SENTRY_RELEASE?.trim() ? { release: env.SENTRY_RELEASE.trim() } : {}),
    exception: { values: [{ type, value: value.slice(0, 1000), stacktrace: { frames: stackFrames(error) } }] },
    tags: {
      ...(context.route ? { route: context.route } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(context.status !== undefined ? { status: String(context.status) } : {}),
      ...(context.source ? { source: context.source } : {})
    },
    ...(context.correlationId ? { extra: { correlationId: context.correlationId } } : {})
  };
  // Second pass: whatever slipped into a field is masked like a log line.
  return maskLogValue(event) as typeof event;
}

export class ErrorReporter {
  private readonly windowStarts: number[] = [];

  constructor(
    private readonly dsn: ParsedDsn | undefined,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly maxPerMinute = 30,
    private readonly env: Record<string, string | undefined> = process.env
  ) {}

  get enabled(): boolean {
    return this.dsn !== undefined;
  }

  private allow(now: number): boolean {
    while (this.windowStarts.length > 0 && now - (this.windowStarts[0] ?? 0) > 60_000) this.windowStarts.shift();
    if (this.windowStarts.length >= this.maxPerMinute) return false;
    this.windowStarts.push(now);
    return true;
  }

  /** Fire-and-forget. Returns the send promise for tests; callers never await it on a request path. */
  report(error: unknown, context: ErrorReportContext = {}): Promise<void> {
    if (!this.dsn || !this.allow(Date.now())) return Promise.resolve();
    const dsn = this.dsn;
    const event = buildErrorEvent(error, context, this.env);
    const header = { event_id: event.event_id, sent_at: new Date().toISOString() };
    const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    return this.fetchImpl(dsn.envelopeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_client=assurmatch-envelope/1.0, sentry_key=${dsn.publicKey}`
      },
      body,
      signal: AbortSignal.timeout(2000)
    }).then((response) => {
      if (!response.ok) logEvent("warn", "error_reporter.refused", { status: response.status });
    }).catch((failure: unknown) => {
      logEvent("warn", "error_reporter.failed", { errorName: failure instanceof Error ? failure.name : "Error" });
    });
  }
}

let shared: ErrorReporter | undefined;

/** Process-wide reporter, built lazily from SENTRY_DSN. */
export function errorReporter(): ErrorReporter {
  shared ??= new ErrorReporter(parseDsn(process.env.SENTRY_DSN));
  return shared;
}

/** Tests only. */
export function setErrorReporter(next: ErrorReporter | undefined): void {
  shared = next;
}
