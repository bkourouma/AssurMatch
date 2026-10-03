/**
 * Spec 057 (PRD I-01, decision D-7): the long-running loop of the dedicated worker container.
 *
 * Each cycle runs every enabled task once, sequentially, then sleeps. Two cycles never overlap. A
 * failing task is logged and the next task still runs. Logs are one JSON object per line and carry
 * counters only: a task summary is reduced to its top-level numeric fields, so recipients,
 * notification ids or per-item outcomes can never reach the log stream.
 */

export interface WorkerTask {
  readonly name: string;
  readonly enabled: boolean;
  run(): Promise<unknown>;
}

export type WorkerLogEvent = Record<string, string | number | boolean | Record<string, number>>;

export interface WorkerLoopOptions {
  intervalMs: number;
  tasks: WorkerTask[];
  /** Runs before each cycle (e.g. reload feature flags). A failure skips the cycle, not the loop. */
  beforeCycle?: () => Promise<void>;
  /** Liveness signal, called after every cycle (and once at start). */
  heartbeat?: () => void | Promise<void>;
  log?: (event: WorkerLogEvent) => void;
  now?: () => Date;
}

export interface CycleOutcome {
  task: string;
  status: "ok" | "error" | "skipped";
  counters?: Record<string, number>;
}

const MAX_ERROR_LENGTH = 160;

export function numericCounters(summary: unknown): Record<string, number> {
  if (!summary || typeof summary !== "object") return {};
  const counters: Record<string, number> = {};
  for (const [key, value] of Object.entries(summary as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) counters[key] = value;
  }
  return counters;
}

/** Error class and a truncated, single-line message. Never a stack, never a payload. */
export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  const message = (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0] ?? "";
  const line = `${name}: ${message}`;
  return line.length > MAX_ERROR_LENGTH ? `${line.slice(0, MAX_ERROR_LENGTH)}...` : line;
}

export class DeliveryWorkerLoop {
  private stopping = false;
  private wake: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cycles = 0;

  constructor(private readonly options: WorkerLoopOptions) {
    if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) throw new Error("Worker interval must be positive");
  }

  get cycleCount(): number {
    return this.cycles;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  /** Asks the loop to finish the current cycle and return. Safe to call more than once. */
  stop(): void {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.wake?.();
  }

  async runCycle(): Promise<CycleOutcome[]> {
    const started = Date.now();
    const outcomes: CycleOutcome[] = [];
    if (this.options.beforeCycle) {
      try {
        await this.options.beforeCycle();
      } catch (error) {
        this.log({ event: "worker.cycle.prepare_failed", error: describeError(error) });
        await this.beat();
        return outcomes;
      }
    }
    for (const task of this.options.tasks) {
      if (!task.enabled) {
        outcomes.push({ task: task.name, status: "skipped" });
        continue;
      }
      const taskStarted = Date.now();
      try {
        const counters = numericCounters(await task.run());
        outcomes.push({ task: task.name, status: "ok", counters });
        this.log({ event: "worker.task.completed", task: task.name, ms: Date.now() - taskStarted, counters });
      } catch (error) {
        outcomes.push({ task: task.name, status: "error" });
        this.log({ event: "worker.task.failed", task: task.name, ms: Date.now() - taskStarted, error: describeError(error) });
      }
    }
    this.cycles += 1;
    this.log({ event: "worker.cycle.completed", cycle: this.cycles, ms: Date.now() - started, failed: outcomes.filter((outcome) => outcome.status === "error").length });
    await this.beat();
    return outcomes;
  }

  /** Runs cycles until `stop()` is called. Resolves once the in-flight cycle has finished. */
  async run(): Promise<void> {
    this.log({
      event: "worker.started",
      intervalMs: this.options.intervalMs,
      tasks: this.options.tasks.map((task) => `${task.name}:${task.enabled ? "on" : "off"}`).join(",")
    });
    await this.beat();
    while (!this.stopping) {
      await this.runCycle();
      if (this.stopping) break;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.timer = setTimeout(resolve, this.options.intervalMs);
      });
      this.wake = undefined;
    }
    this.log({ event: "worker.stopped", cycles: this.cycles });
  }

  private async beat(): Promise<void> {
    try {
      await this.options.heartbeat?.();
    } catch (error) {
      this.log({ event: "worker.heartbeat.failed", error: describeError(error) });
    }
  }

  private log(event: WorkerLogEvent): void {
    const at = (this.options.now ?? (() => new Date()))().toISOString();
    (this.options.log ?? ((entry) => process.stdout.write(`${JSON.stringify(entry)}\n`)))({ at, level: String(event.event).endsWith("failed") ? "error" : "info", ...event });
  }
}

export function readIntegerEnv(env: Record<string, string | undefined>, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return value;
}
