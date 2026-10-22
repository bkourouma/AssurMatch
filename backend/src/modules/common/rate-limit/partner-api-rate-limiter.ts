import { HttpException, HttpStatus } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ErrorCodes } from "../../../../../packages/shared/contracts/error-codes";
import { httpMetrics } from "../../observability/http-metrics";
import { logEvent } from "../../observability/structured-logger";
import type { RedisClientPort } from "../redis/redis.module";

/**
 * Spec 075 FR-C1..C3: fixed-window rate limiting of `partner-api/v1/*`.
 *
 * Two buckets per request: one per API key (hash of the key presented, whether it exists or not, so
 * brute force on keys is throttled without revealing validity) and one per client IP. Neither the key
 * nor the IP is stored in clear in Redis or logged.
 */
export interface PartnerApiRateLimitConfig {
  windowSeconds: number;
  keyMax: number;
  ipMax: number;
}

export interface PartnerApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window ends. */
  resetSeconds: number;
}

export interface PartnerApiRateLimitInput {
  /** Raw API key as presented (never stored). Absent when the request carries none. */
  apiKey?: string | undefined;
  ip?: string | undefined;
}

function intEnv(env: Record<string, string | undefined>, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function partnerApiRateLimitConfig(env: Record<string, string | undefined> = process.env): PartnerApiRateLimitConfig {
  return {
    windowSeconds: intEnv(env, "ASSURMATCH_PARTNER_API_RATE_LIMIT_WINDOW_SECONDS", 60, 1, 86_400),
    keyMax: intEnv(env, "ASSURMATCH_PARTNER_API_RATE_LIMIT_KEY_MAX", 120, 1, 1_000_000),
    ipMax: intEnv(env, "ASSURMATCH_PARTNER_API_RATE_LIMIT_IP_MAX", 600, 1, 1_000_000)
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function partnerApiRateLimitedError(retryAfterSeconds: number): HttpException {
  const error = new HttpException({ code: ErrorCodes.RATE_LIMITED, message: "Too many requests. Please try again later." }, HttpStatus.TOO_MANY_REQUESTS);
  (error as HttpException & { retryAfterSeconds?: number }).retryAfterSeconds = retryAfterSeconds;
  return error;
}

interface FallbackEntry {
  count: number;
  expiresAt: number;
}

const FALLBACK_MAX_ENTRIES = 10_000;
const DEGRADED_LOG_INTERVAL_MS = 30_000;

type ResponseLike = { setHeader?: (name: string, value: string) => unknown };

export class PartnerApiRateLimiter {
  private readonly fallback = new Map<string, FallbackEntry>();
  private lastDegradedLogAt = 0;

  constructor(
    private readonly redis: RedisClientPort,
    private readonly config: PartnerApiRateLimitConfig = partnerApiRateLimitConfig(),
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Counts the request in both buckets; the verdict is the most restrictive one. */
  async consume(input: PartnerApiRateLimitInput): Promise<PartnerApiRateLimitResult> {
    const nowMs = this.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowIndex = Math.floor(nowMs / windowMs);
    const resetSeconds = Math.max(1, Math.ceil(((windowIndex + 1) * windowMs - nowMs) / 1000));
    const ipKey = `partner-api:rl:${windowIndex}:ip:${digest(input.ip ?? "unknown")}`;
    const buckets = [{ key: ipKey, limit: this.config.ipMax }];
    if (input.apiKey) buckets.unshift({ key: `partner-api:rl:${windowIndex}:key:${digest(input.apiKey)}`, limit: this.config.keyMax });

    let allowed = true;
    let reported: { limit: number; remaining: number } | undefined;
    for (const bucket of buckets) {
      const count = await this.increment(bucket.key, resetSeconds + 1, nowMs);
      const remaining = Math.max(0, bucket.limit - count);
      if (count > bucket.limit) allowed = false;
      if (!reported || remaining < reported.remaining) reported = { limit: bucket.limit, remaining };
    }
    return { allowed, limit: reported?.limit ?? this.config.ipMax, remaining: reported?.remaining ?? 0, resetSeconds };
  }

  /** Throws a neutral 429 when over a limit; otherwise sets the `X-RateLimit-*` headers when a response is reachable. */
  async enforce(input: PartnerApiRateLimitInput, request?: unknown): Promise<PartnerApiRateLimitResult> {
    const result = await this.consume(input);
    const response = (request as { res?: ResponseLike } | undefined)?.res;
    const setHeader = (name: string, value: string): void => {
      try {
        response?.setHeader?.(name, value);
      } catch {
        // Headers are informative only.
      }
    };
    setHeader("X-RateLimit-Limit", String(result.limit));
    setHeader("X-RateLimit-Remaining", String(result.remaining));
    setHeader("X-RateLimit-Reset", String(result.resetSeconds));
    if (!result.allowed) {
      setHeader("Retry-After", String(result.resetSeconds));
      httpMetrics.recordRateLimited("partner-api");
      throw partnerApiRateLimitedError(result.resetSeconds);
    }
    return result;
  }

  private async increment(key: string, ttlSeconds: number, nowMs: number): Promise<number> {
    try {
      return await this.redis.incr(key, ttlSeconds);
    } catch {
      this.logDegraded(nowMs);
      return this.incrementFallback(key, ttlSeconds, nowMs);
    }
  }

  private incrementFallback(key: string, ttlSeconds: number, nowMs: number): number {
    const existing = this.fallback.get(key);
    if (existing && existing.expiresAt > nowMs) {
      existing.count += 1;
      return existing.count;
    }
    if (this.fallback.size >= FALLBACK_MAX_ENTRIES) {
      for (const [entryKey, entry] of this.fallback) if (entry.expiresAt <= nowMs) this.fallback.delete(entryKey);
      // Still full: drop the oldest entries (insertion order) so memory stays bounded.
      while (this.fallback.size >= FALLBACK_MAX_ENTRIES) {
        const oldest = this.fallback.keys().next().value;
        if (oldest === undefined) break;
        this.fallback.delete(oldest);
      }
    }
    this.fallback.set(key, { count: 1, expiresAt: nowMs + ttlSeconds * 1000 });
    return 1;
  }

  private logDegraded(nowMs: number): void {
    if (nowMs - this.lastDegradedLogAt < DEGRADED_LOG_INTERVAL_MS) return;
    this.lastDegradedLogAt = nowMs;
    logEvent("warn", "partner_api.rate_limit_degraded", { store: "redis_unavailable", fallback: "memory" });
  }
}
