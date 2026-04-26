import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";

describe("RedisClientPort memory-test adapter", () => {
  it("supports ttl, increment and atomic setNx semantics", async () => {
    const redis = new InMemoryRedisClient();

    await redis.set("cache:test", "value", 60);
    expect(await redis.get("cache:test")).toBe("value");
    expect(await redis.incr("rate:test", 60)).toBe(1);
    expect(await redis.incr("rate:test", 60)).toBe(2);
    expect(await redis.setNx("lock:test", "owner-a", 60)).toBe(true);
    expect(await redis.setNx("lock:test", "owner-b", 60)).toBe(false);
  });
});
