import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";

describe("Redis cache contract", () => {
  it("sets, gets, deletes and increments keys", async () => {
    const redis = new InMemoryRedisClient();
    await redis.set("catalog:countries:public", "[]");
    expect(await redis.get("catalog:countries:public")).toBe("[]");
    expect(await redis.incr("rate:test", 60)).toBe(1);
    await redis.del("catalog:countries:public");
    expect(await redis.get("catalog:countries:public")).toBeNull();
  });
});
