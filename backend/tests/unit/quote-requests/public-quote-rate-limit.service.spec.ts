import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { PublicQuoteRateLimitService } from "../../../src/modules/quote-requests/public-quote-rate-limit.service";

describe("PublicQuoteRateLimitService", () => {
  it("blocks submissions over the configured TTL counter limit", async () => {
    const service = new PublicQuoteRateLimitService(new InMemoryRedisClient(), 1, 60);

    await expect(service.assertAllowed("203.0.113.10", "country", "product")).resolves.toBeUndefined();
    await expect(service.assertAllowed("203.0.113.10", "country", "product")).rejects.toThrow("Rate limit exceeded");
  });
});
