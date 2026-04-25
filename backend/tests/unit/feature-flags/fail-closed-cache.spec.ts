import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { FeatureFlagCacheService } from "../../../src/modules/feature-flags/feature-flag-cache.service";

describe("feature flag cache fail-closed behavior", () => {
  it("returns false when cache is incoherent", async () => {
    const cache = new FeatureFlagCacheService(new InMemoryRedisClient());
    await cache.put({ key: "country_public_enabled", scopeType: "country", scopeId: "ci", value: true, cacheVersion: 1 });
    cache.markIncoherent();

    await expect(cache.isFailClosed("country_public_enabled", "country", "ci")).resolves.toBe(false);
  });
});
