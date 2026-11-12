import { execFileSync } from "node:child_process";

// Read-only look at the rate-limit counters of the e2e stack, plus ONE reset (the partner-application bucket)
// because a candidature costs one slot even when it is invalid, duplicated or refused, and the bucket is
// 3 per hour per IP for the whole stack. Never reset an `auth:rl:*` key and never test a limit (the IP
// stays blocked for an hour for every lot).

const container = `${process.env.E2E_COMPOSE_PROJECT ?? "assurmatch-e2e"}-redis-1`;
const redisPort = process.env.E2E_REDIS_PORT ?? "48679";

function redis(...args: string[]): string {
  return execFileSync("docker", ["exec", container, "redis-cli", "-p", redisPort, ...args], { encoding: "utf8" }).trim();
}

/** Counters of the rate-limit keys that currently exist, e.g. { "auth:rl:/auth/login:ip:...": 11 }. */
export function rateLimitCounters(pattern = "*rl:*"): Record<string, { count: number; ttl: number }> {
  const result: Record<string, { count: number; ttl: number }> = {};
  for (const key of redis("--scan", "--pattern", pattern).split(/\r?\n/u).filter(Boolean)) {
    result[key] = { count: Number(redis("get", key)), ttl: Number(redis("ttl", key)) };
  }
  return result;
}

/** Remaining candidature slots of the current hour for the test IP (3 per hour). */
export function applicationSlotsLeft(): number {
  const keys = Object.entries(rateLimitCounters("rl:public:partner_application:*"));
  return 3 - keys.reduce((max, [, value]) => Math.max(max, value.count), 0);
}

/** Resets the candidature bucket (only that one) so the next batch of at most 3 submissions starts clean. */
export function resetApplicationRateLimit(): void {
  for (const key of redis("--scan", "--pattern", "rl:public:partner_application:*").split(/\r?\n/u).filter(Boolean)) redis("del", key);
}
