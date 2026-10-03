import type { PrismaService } from "../common/prisma/prisma.service";
import type { RedisClientPort } from "../common/redis/redis.module";

export type ProbeState = "ok" | "down";

export interface ReadinessReport {
  status: "ready" | "not_ready";
  checks: Record<string, ProbeState>;
}

export type ReadinessProbe = () => Promise<ProbeState | "degraded">;

export const DEFAULT_PROBE_TIMEOUT_MS = 2000;

/**
 * Runs one dependency probe with a hard deadline. Any exception, any non-"ok" answer and any
 * answer arriving after the deadline count as "down". The error itself is swallowed on purpose:
 * `/readyz` is public and must never echo a hostname, a driver message or a stack.
 */
export async function runProbe(probe: ReadinessProbe, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<ProbeState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ProbeState>((resolve) => {
    timer = setTimeout(() => resolve("down"), timeoutMs);
  });
  const attempt = Promise.resolve()
    .then(probe)
    .then((state): ProbeState => (state === "ok" ? "ok" : "down"))
    .catch((): ProbeState => "down");
  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkReadiness(probes: Record<string, ReadinessProbe>, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<ReadinessReport> {
  const entries = Object.entries(probes);
  const states = await Promise.all(entries.map(([, probe]) => runProbe(probe, timeoutMs)));
  const checks: Record<string, ProbeState> = {};
  entries.forEach(([name], index) => {
    checks[name] = states[index] ?? "down";
  });
  return { status: states.every((state) => state === "ok") ? "ready" : "not_ready", checks };
}

/** `SELECT 1` against the real pool. The test adapter has no database to reach and reports ok. */
export function databaseProbe(prisma: Pick<PrismaService, "runtimeMode" | "runtimeClient">): ReadinessProbe {
  return async () => {
    if (prisma.runtimeMode !== "prisma-client") return "ok";
    const client = prisma.runtimeClient as unknown as { $queryRawUnsafe?: (sql: string) => Promise<unknown> } | undefined;
    if (!client?.$queryRawUnsafe) return "down";
    await client.$queryRawUnsafe("SELECT 1");
    return "ok";
  };
}

/** `PING` through the shared Redis client (the in-memory test client always answers ok). */
export function redisProbe(redis: Pick<RedisClientPort, "health">): ReadinessProbe {
  return async () => ((await redis.health()) === "ok" ? "ok" : "down");
}
