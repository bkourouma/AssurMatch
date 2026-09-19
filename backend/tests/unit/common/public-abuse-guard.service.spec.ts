import { describe, expect, it } from "vitest";
import { PublicAbuseGuardService } from "../../../src/modules/common/abuse/public-abuse-guard.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";

const baseInput = {
  scope: "waitlist" as const,
  ipAddress: "203.0.113.10",
  limitPerWindow: 3,
  windowSeconds: 60
};

describe("PublicAbuseGuardService", () => {
  it("allows a submission under the per-IP limit", async () => {
    const guard = new PublicAbuseGuardService(new InMemoryRedisClient());

    await expect(guard.assertAllowed(baseInput)).resolves.toBeUndefined();
  });

  it("blocks a filled honeypot before touching the counters", async () => {
    const redis = new InMemoryRedisClient();
    const guard = new PublicAbuseGuardService(redis);

    await expect(guard.assertAllowed({ ...baseInput, honeypot: "https://spam.example" })).rejects.toThrow("Invalid submission: spam_blocked");
    // An empty or whitespace-only honeypot is what a real browser sends back.
    await expect(guard.assertAllowed({ ...baseInput, honeypot: "" })).resolves.toBeUndefined();
    await expect(guard.assertAllowed({ ...baseInput, honeypot: "   " })).resolves.toBeUndefined();
  });

  it("rate limits per IP once the window budget is spent", async () => {
    const guard = new PublicAbuseGuardService(new InMemoryRedisClient());

    for (let attempt = 0; attempt < baseInput.limitPerWindow; attempt += 1) {
      await guard.assertAllowed(baseInput);
    }

    await expect(guard.assertAllowed(baseInput)).rejects.toThrow("Rate limit exceeded for public submissions");
  });

  it("keeps scopes and IPs independent", async () => {
    const guard = new PublicAbuseGuardService(new InMemoryRedisClient());

    for (let attempt = 0; attempt < baseInput.limitPerWindow; attempt += 1) {
      await guard.assertAllowed(baseInput);
    }

    await expect(guard.assertAllowed({ ...baseInput, scope: "contact" })).resolves.toBeUndefined();
    await expect(guard.assertAllowed({ ...baseInput, ipAddress: "203.0.113.11" })).resolves.toBeUndefined();
  });

  it("blocks a session burst above ten submissions in the burst window", async () => {
    const guard = new PublicAbuseGuardService(new InMemoryRedisClient());
    const input = { ...baseInput, sessionId: "session-1", limitPerWindow: 1000 };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await guard.assertAllowed(input);
    }

    await expect(guard.assertAllowed(input)).rejects.toThrow("Invalid submission: spam_blocked");
    await expect(guard.assertAllowed({ ...input, sessionId: "session-2" })).resolves.toBeUndefined();
  });

  it("stores no raw IP or session id in the cache keys", async () => {
    const redis = new InMemoryRedisClient();
    const guard = new PublicAbuseGuardService(redis);

    await guard.assertAllowed({ ...baseInput, sessionId: "session-secret" });

    expect(await redis.get(`rl:public:waitlist:${baseInput.ipAddress}`)).toBeNull();
    expect(await redis.get("spam:public:waitlist:session-secret")).toBeNull();
  });
});
