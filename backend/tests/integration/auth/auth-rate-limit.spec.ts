import { afterEach, describe, expect, it } from "vitest";
import { AuthRateLimiter, authRateLimitConfig, authRateLimitKeys } from "../../../src/modules/auth/rate-limit.guard";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { httpMetrics } from "../../../src/modules/observability/http-metrics";
import { actorHeaders, createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("auth rate-limit keys (spec 058 FR-006)", () => {
  it("builds separate IP and identifier buckets without storing the e-mail or the IP in clear", () => {
    const keys = authRateLimitKeys({ route: "/auth/login", ip: "203.0.113.7", identifier: "USER@Example.COM" });
    expect(keys.ip).toMatch(/^auth:rl:\/auth\/login:ip:[0-9a-f]{32}$/);
    expect(keys.identifier).toMatch(/^auth:rl:\/auth\/login:id:[0-9a-f]{32}$/);
    expect(JSON.stringify(keys)).not.toMatch(/203\.0\.113\.7|example\.com|user@/i);
    // The identifier is normalised before hashing.
    expect(authRateLimitKeys({ route: "/auth/login", identifier: " user@example.com " }).identifier).toBe(keys.identifier);
  });

  it("does not require an identifier bucket", () => {
    expect(authRateLimitKeys({ route: "/auth/mfa/verify", ip: "127.0.0.1" }).identifier).toBeUndefined();
  });

  it("reads bounded settings from the environment and falls back on invalid values", () => {
    expect(authRateLimitConfig({})).toEqual({ windowSeconds: 900, ipMax: 100, identifierMax: 10 });
    expect(authRateLimitConfig({ ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX: "3", ASSURMATCH_AUTH_RATE_LIMIT_IP_MAX: "abc", ASSURMATCH_AUTH_RATE_LIMIT_WINDOW_SECONDS: "1" }))
      .toEqual({ windowSeconds: 900, ipMax: 100, identifierMax: 3 });
  });
});

describe("AuthRateLimiter (spec 058 FR-006)", () => {
  const fail = () => Promise.reject(new Error("Invalid credentials"));

  it("blocks an identifier after N failures, before the attempt runs", async () => {
    const limiter = new AuthRateLimiter(new InMemoryRedisClient(), { windowSeconds: 60, ipMax: 100, identifierMax: 3 });
    const input = { route: "/auth/login", ip: "198.51.100.1", identifier: "a@example.com" };
    for (let index = 0; index < 3; index += 1) await expect(limiter.run(input, fail)).rejects.toThrow("Invalid credentials");
    let ran = false;
    await expect(limiter.run(input, async () => { ran = true; return "ok"; })).rejects.toMatchObject({ status: 429 });
    expect(ran).toBe(false);
  });

  it("clears the identifier failures after a success", async () => {
    const limiter = new AuthRateLimiter(new InMemoryRedisClient(), { windowSeconds: 60, ipMax: 100, identifierMax: 2 });
    const input = { route: "/auth/login", ip: "198.51.100.2", identifier: "b@example.com" };
    await expect(limiter.run(input, fail)).rejects.toThrow();
    await expect(limiter.run(input, async () => "ok")).resolves.toBe("ok");
    await expect(limiter.run(input, fail)).rejects.toThrow("Invalid credentials");
    await expect(limiter.run(input, async () => "ok")).resolves.toBe("ok");
  });

  it("limits every attempt per IP, whatever the identifier", async () => {
    const limiter = new AuthRateLimiter(new InMemoryRedisClient(), { windowSeconds: 60, ipMax: 2, identifierMax: 100 });
    await limiter.run({ route: "/auth/login", ip: "198.51.100.3", identifier: "c1@example.com" }, async () => "ok");
    await limiter.run({ route: "/auth/login", ip: "198.51.100.3", identifier: "c2@example.com" }, async () => "ok");
    await expect(limiter.run({ route: "/auth/login", ip: "198.51.100.3", identifier: "c3@example.com" }, async () => "ok")).rejects.toMatchObject({ status: 429 });
    await expect(limiter.run({ route: "/auth/login", ip: "198.51.100.4", identifier: "c3@example.com" }, async () => "ok")).resolves.toBe("ok");
  });
});

describe("auth rate limiting over HTTP (spec 058 FR-006)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const saved = process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    if (saved === undefined) delete process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX;
    else process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX = saved;
  });

  function login(email: string) {
    return harness!.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "wrong password 123" })
    });
  }

  it("answers a neutral 429 after N failed logins, identical for an existing and an unknown account", async () => {
    process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX = "3";
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "admin-rate-limit", roles: ["super_admin" as const], mfaVerified: true };
    await harness.runtime.users.service.create({ email: "known@example.com", displayName: "Known", roles: ["support_admin"] }, admin);
    // AUTH_LOCKOUT_THRESHOLD (5) is above the limit used here, so the account is never locked first.
    for (let index = 0; index < 3; index += 1) {
      expect((await login("ghost@example.com")).status).not.toBe(429);
      expect((await login("known@example.com")).status).not.toBe(429);
    }
    const before = (httpMetrics.render().match(/assurmatch_auth_rate_limited_total\{route="\/auth\/login"\} (\d+)/)?.[1]) ?? "0";

    const unknown = await login("ghost@example.com");
    const known = await login("known@example.com");
    expect(unknown.status).toBe(429);
    expect(known.status).toBe(429);
    const unknownBody = await unknown.json() as Record<string, unknown>;
    const knownBody = await known.json() as Record<string, unknown>;
    expect({ ...unknownBody, correlationId: "x" }).toEqual({ ...knownBody, correlationId: "x" });
    expect(unknownBody).toMatchObject({ code: "RATE_LIMITED", message: "Too many attempts. Please try again later." });
    expect(JSON.stringify(unknownBody)).not.toMatch(/ghost|known|example\.com/);

    const after = Number(httpMetrics.render().match(/assurmatch_auth_rate_limited_total\{route="\/auth\/login"\} (\d+)/)?.[1] ?? "0");
    expect(after).toBe(Number(before) + 2);
    // Another identifier from the same IP is still allowed (IP limit is higher).
    expect((await login("other@example.com")).status).not.toBe(429);
  }, 60_000);

  it("limits password-reset attempts per token and MFA verification per user", async () => {
    process.env.ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX = "2";
    harness = await createRuntimeHttpHarness();
    const reset = () => harness!.request("/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-reset-token", newPassword: "a new password 123456" })
    });
    expect((await reset()).status).not.toBe(429);
    expect((await reset()).status).not.toBe(429);
    expect((await reset()).status).toBe(429);

    const admin = { actorId: "admin-rate-limit", roles: ["super_admin" as const], mfaVerified: true };
    const user = await harness.runtime.users.service.create({ email: "mfa-limit@example.com", displayName: "Mfa", roles: ["support_admin"] }, admin);
    const headers = { ...actorHeaders({ actorId: user.id, roles: ["support_admin"], mfaVerified: false }), "content-type": "application/json" };
    const verify = () => harness!.request("/auth/mfa/verify", { method: "POST", headers, body: JSON.stringify({ code: "000000" }) });
    expect((await verify()).status).not.toBe(429);
    expect((await verify()).status).not.toBe(429);
    expect((await verify()).status).toBe(429);
  }, 60_000);
});
