/**
 * Spec 058 FR-003: in-process metrics rendered in the Prometheus text format (0.0.4), without a
 * client library. Labels are route templates (`/leads/:id`), never raw URLs, so neither an
 * identifier nor a query string can reach the metrics, and cardinality stays bounded.
 */
export const LATENCY_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface Histogram {
  buckets: number[];
  sum: number;
  count: number;
}

export interface WorkerMetricsSnapshot {
  lastCycleAt?: string;
  notificationsBacklog?: number;
  taskFailuresTotal: Record<string, number>;
  taskErrorsTotal: Record<string, number>;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function labels(record: Record<string, string>): string {
  const entries = Object.entries(record);
  return entries.length === 0 ? "" : `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`;
}

function key(record: Record<string, string>): string {
  return JSON.stringify(record);
}

export class HttpMetricsRegistry {
  private readonly requests = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly latency = new Map<string, Histogram>();
  private readonly rateLimited = new Map<string, number>();

  recordRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const base = { method: method.toUpperCase(), route };
    const requestKey = key({ ...base, status: String(status) });
    this.requests.set(requestKey, (this.requests.get(requestKey) ?? 0) + 1);
    if (status >= 500) this.errors.set(key(base), (this.errors.get(key(base)) ?? 0) + 1);
    const histogramKey = key(base);
    const histogram = this.latency.get(histogramKey) ?? { buckets: LATENCY_BUCKETS_SECONDS.map(() => 0), sum: 0, count: 0 };
    LATENCY_BUCKETS_SECONDS.forEach((bound, index) => {
      if (durationSeconds <= bound) histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1;
    });
    histogram.sum += durationSeconds;
    histogram.count += 1;
    this.latency.set(histogramKey, histogram);
  }

  recordRateLimited(route: string): void {
    const routeKey = key({ route });
    this.rateLimited.set(routeKey, (this.rateLimited.get(routeKey) ?? 0) + 1);
  }

  reset(): void {
    this.requests.clear();
    this.errors.clear();
    this.latency.clear();
    this.rateLimited.clear();
  }

  render(worker?: WorkerMetricsSnapshot, now = new Date()): string {
    const lines: string[] = [];
    const counter = (name: string, help: string, values: Map<string, number>) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      for (const [labelKey, value] of values) lines.push(`${name}${labels(JSON.parse(labelKey) as Record<string, string>)} ${value}`);
    };
    counter("assurmatch_http_requests_total", "HTTP requests by method, route template and status.", this.requests);
    counter("assurmatch_http_request_errors_total", "HTTP responses with a 5xx status by method and route template.", this.errors);

    lines.push("# HELP assurmatch_http_request_duration_seconds HTTP request latency by method and route template.", "# TYPE assurmatch_http_request_duration_seconds histogram");
    for (const [labelKey, histogram] of this.latency) {
      const base = JSON.parse(labelKey) as Record<string, string>;
      LATENCY_BUCKETS_SECONDS.forEach((bound, index) => {
        lines.push(`assurmatch_http_request_duration_seconds_bucket${labels({ ...base, le: String(bound) })} ${histogram.buckets[index] ?? 0}`);
      });
      lines.push(`assurmatch_http_request_duration_seconds_bucket${labels({ ...base, le: "+Inf" })} ${histogram.count}`);
      lines.push(`assurmatch_http_request_duration_seconds_sum${labels(base)} ${Number(histogram.sum.toFixed(6))}`);
      lines.push(`assurmatch_http_request_duration_seconds_count${labels(base)} ${histogram.count}`);
    }
    counter("assurmatch_auth_rate_limited_total", "Authentication attempts refused by the rate limiter, by route.", this.rateLimited);

    const gauge = (name: string, help: string, value: number | undefined) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
      if (value !== undefined && Number.isFinite(value)) lines.push(`${name} ${value}`);
    };
    const lastCycle = worker?.lastCycleAt ? Date.parse(worker.lastCycleAt) : Number.NaN;
    gauge("assurmatch_worker_last_cycle_timestamp_seconds", "Unix time of the last completed worker cycle (absent when unknown).", Number.isFinite(lastCycle) ? Math.floor(lastCycle / 1000) : undefined);
    gauge("assurmatch_worker_last_cycle_age_seconds", "Seconds since the last completed worker cycle (absent when unknown).", Number.isFinite(lastCycle) ? Math.max(0, Math.round((now.getTime() - lastCycle) / 1000)) : undefined);
    gauge("assurmatch_notifications_backlog", "Quote notifications due at the last worker cycle.", worker?.notificationsBacklog);

    const taskCounter = (name: string, help: string, values: Record<string, number> | undefined) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      for (const [task, value] of Object.entries(values ?? {})) lines.push(`${name}${labels({ task })} ${value}`);
    };
    taskCounter("assurmatch_worker_task_failures_total", "Deliveries reported as failed by worker tasks (cumulative).", worker?.taskFailuresTotal);
    taskCounter("assurmatch_worker_task_errors_total", "Worker task runs that threw (cumulative).", worker?.taskErrorsTotal);

    gauge("assurmatch_process_uptime_seconds", "API process uptime.", Math.round(process.uptime()));
    gauge("assurmatch_process_resident_memory_bytes", "API process resident memory.", process.memoryUsage().rss);
    return `${lines.join("\n")}\n`;
  }
}

/** One registry per API process. */
export const httpMetrics = new HttpMetricsRegistry();
