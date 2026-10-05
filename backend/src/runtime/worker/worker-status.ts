import type { RedisClientPort } from "../../modules/common/redis/redis.module";
import type { WorkerMetricsSnapshot } from "../../modules/observability/http-metrics";
import type { CycleOutcome } from "./delivery-worker-loop";

/**
 * Spec 058 FR-003: the worker runs in its own container, so it publishes a small status snapshot to
 * Redis after every cycle and the API reads it when Prometheus scrapes `/metrics`. Counters only:
 * no notification id, recipient or payload ever reaches this key. One worker replica (spec 057), so
 * the read-modify-write of the cumulative totals cannot race.
 */
export const WORKER_STATUS_KEY = "assurmatch:worker:status";
const QUOTE_NOTIFICATIONS_TASK = "quote-notifications";

export interface WorkerStatusSnapshot extends WorkerMetricsSnapshot {
  lastCycleAt: string;
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return !!value && typeof value === "object" && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}

export async function readWorkerStatus(redis: Pick<RedisClientPort, "get">): Promise<WorkerMetricsSnapshot | undefined> {
  try {
    const raw = await redis.get(WORKER_STATUS_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<WorkerStatusSnapshot>;
    return {
      ...(typeof parsed.lastCycleAt === "string" ? { lastCycleAt: parsed.lastCycleAt } : {}),
      ...(typeof parsed.notificationsBacklog === "number" ? { notificationsBacklog: parsed.notificationsBacklog } : {}),
      taskFailuresTotal: isRecordOfNumbers(parsed.taskFailuresTotal) ? parsed.taskFailuresTotal : {},
      taskErrorsTotal: isRecordOfNumbers(parsed.taskErrorsTotal) ? parsed.taskErrorsTotal : {}
    };
  } catch {
    return undefined;
  }
}

export async function recordWorkerCycle(redis: Pick<RedisClientPort, "get" | "set">, outcomes: CycleOutcome[], now = new Date()): Promise<WorkerStatusSnapshot> {
  const previous = await readWorkerStatus(redis);
  const taskFailuresTotal = { ...(previous?.taskFailuresTotal ?? {}) };
  const taskErrorsTotal = { ...(previous?.taskErrorsTotal ?? {}) };
  let notificationsBacklog = previous?.notificationsBacklog;
  for (const outcome of outcomes) {
    if (outcome.status === "error") taskErrorsTotal[outcome.task] = (taskErrorsTotal[outcome.task] ?? 0) + 1;
    const failed = outcome.counters?.failed;
    if (typeof failed === "number" && failed > 0) taskFailuresTotal[outcome.task] = (taskFailuresTotal[outcome.task] ?? 0) + failed;
    if (outcome.task === QUOTE_NOTIFICATIONS_TASK && outcome.status === "ok" && typeof outcome.counters?.due === "number") {
      notificationsBacklog = Math.max(0, outcome.counters.due - (outcome.counters.sent ?? 0));
    }
  }
  const snapshot: WorkerStatusSnapshot = {
    lastCycleAt: now.toISOString(),
    ...(notificationsBacklog !== undefined ? { notificationsBacklog } : {}),
    taskFailuresTotal,
    taskErrorsTotal
  };
  await redis.set(WORKER_STATUS_KEY, JSON.stringify(snapshot));
  return snapshot;
}
