import { HttpException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRedisClient, type RedisClientPort } from "../../../src/modules/common/redis/redis.module";
import { PartnerApiRateLimiter, partnerApiRateLimitConfig } from "../../../src/modules/common/rate-limit/partner-api-rate-limiter";
import { setLogSink } from "../../../src/modules/observability/structured-logger";

const CONFIG = { windowSeconds: 60, keyMax: 3, ipMax: 100 };

class SpyRedis extends InMemoryRedisClient {
  readonly keys: string[] = [];
  override async incr(key: string, ttlSeconds?: number): Promise<number> {
    this.keys.push(key);
    return super.incr(key, ttlSeconds);
  }
}

class BrokenRedis extends InMemoryRedisClient {
  override async incr(): Promise<number> {
    throw new Error("redis down");
  }
}

function limiter(redis: RedisClientPort, config = CONFIG) {
  return new PartnerApiRateLimiter(redis, config, () => Date.now());
}

describe("PartnerApiRateLimiter (spec 075 FR-C1..C3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:10.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    setLogSink(undefined);
  });

  it("lets N requests through and answers 429 with Retry-After on N+1", async () => {
    const rl = limiter(new InMemoryRedisClient());
    for (let i = 0; i < 3; i += 1) {
      const result = await rl.consume({ apiKey: "am_pk_a", ip: "1.1.1.1" });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2 - i);
    }
    const headers: Record<string, string> = {};
    const request = { res: { setHeader: (name: string, value: string) => { headers[name] = value; } } };
    const error = await rl.enforce({ apiKey: "am_pk_a", ip: "1.1.1.1" }, request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({ code: "RATE_LIMITED" });
    expect(headers["Retry-After"]).toBe("50");
    expect(headers["X-RateLimit-Limit"]).toBe("3");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["X-RateLimit-Reset"]).toBe("50");
  });

  it("isolates two API keys and two IPs", async () => {
    const rl = limiter(new InMemoryRedisClient(), { windowSeconds: 60, keyMax: 2, ipMax: 3 });
    await rl.consume({ apiKey: "k1", ip: "1.1.1.1" });
    await rl.consume({ apiKey: "k1", ip: "1.1.1.2" });
    expect((await rl.consume({ apiKey: "k1", ip: "1.1.1.3" })).allowed).toBe(false);
    expect((await rl.consume({ apiKey: "k2", ip: "1.1.1.4" })).allowed).toBe(true);
    // IP bucket: same IP, different keys, exceeds ipMax.
    await rl.consume({ apiKey: "k5", ip: "9.9.9.9" });
    await rl.consume({ apiKey: "k6", ip: "9.9.9.9" });
    await rl.consume({ apiKey: "k7", ip: "9.9.9.9" });
    expect((await rl.consume({ apiKey: "k8", ip: "9.9.9.9" })).allowed).toBe(false);
    expect((await rl.consume({ apiKey: "k8", ip: "8.8.8.8" })).allowed).toBe(true);
  });

  it("throttles requests without a key by IP only", async () => {
    const rl = limiter(new InMemoryRedisClient(), { windowSeconds: 60, keyMax: 5, ipMax: 2 });
    expect((await rl.consume({ ip: "2.2.2.2" })).allowed).toBe(true);
    expect((await rl.consume({ ip: "2.2.2.2" })).allowed).toBe(true);
    expect((await rl.consume({ ip: "2.2.2.2" })).allowed).toBe(false);
  });

  it("resets after the window expires", async () => {
    const rl = limiter(new InMemoryRedisClient());
    for (let i = 0; i < 4; i += 1) await rl.consume({ apiKey: "k", ip: "1.1.1.1" });
    expect((await rl.consume({ apiKey: "k", ip: "1.1.1.1" })).allowed).toBe(false);
    vi.advanceTimersByTime(51_000);
    const result = await rl.consume({ apiKey: "k", ip: "1.1.1.1" });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("never stores the API key or the IP in clear in Redis keys", async () => {
    const redis = new SpyRedis();
    await limiter(redis).consume({ apiKey: "am_pk_SECRETVALUE123", ip: "203.0.113.77" });
    expect(redis.keys).toHaveLength(2);
    for (const key of redis.keys) {
      expect(key).not.toContain("SECRETVALUE");
      expect(key).not.toContain("203.0.113.77");
      expect(key).toMatch(/^partner-api:rl:\d+:(key|ip):[0-9a-f]{32}$/);
    }
  });

  it("fails open on a memory fallback when Redis throws, logs once without key or IP, and still limits", async () => {
    const entries: Array<Record<string, unknown>> = [];
    setLogSink((entry) => { entries.push(entry as unknown as Record<string, unknown>); });
    const rl = limiter(new BrokenRedis());
    const verdicts: boolean[] = [];
    for (let i = 0; i < 4; i += 1) verdicts.push((await rl.consume({ apiKey: "am_pk_LEAK", ip: "203.0.113.5" })).allowed);
    expect(verdicts).toEqual([true, true, true, false]);
    const degraded = entries.filter((entry) => entry.event === "partner_api.rate_limit_degraded");
    expect(degraded).toHaveLength(1);
    expect(degraded[0]?.level).toBe("warn");
    expect(JSON.stringify(entries)).not.toContain("am_pk_LEAK");
    expect(JSON.stringify(entries)).not.toContain("203.0.113.5");
  });

  it("falls back to defaults on invalid configuration", () => {
    expect(partnerApiRateLimitConfig({})).toEqual({ windowSeconds: 60, keyMax: 120, ipMax: 600 });
    expect(partnerApiRateLimitConfig({
      ASSURMATCH_PARTNER_API_RATE_LIMIT_WINDOW_SECONDS: "abc",
      ASSURMATCH_PARTNER_API_RATE_LIMIT_KEY_MAX: "-4",
      ASSURMATCH_PARTNER_API_RATE_LIMIT_IP_MAX: "1.5"
    })).toEqual({ windowSeconds: 60, keyMax: 120, ipMax: 600 });
    expect(partnerApiRateLimitConfig({
      ASSURMATCH_PARTNER_API_RATE_LIMIT_WINDOW_SECONDS: "30",
      ASSURMATCH_PARTNER_API_RATE_LIMIT_KEY_MAX: "7",
      ASSURMATCH_PARTNER_API_RATE_LIMIT_IP_MAX: "9"
    })).toEqual({ windowSeconds: 30, keyMax: 7, ipMax: 9 });
  });
});
