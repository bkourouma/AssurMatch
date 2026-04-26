import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { PublicAntiSpamService } from "../../../src/modules/quote-requests/public-anti-spam.service";
import { PublicQuoteRateLimitService } from "../../../src/modules/quote-requests/public-quote-rate-limit.service";
import { QuoteDuplicateDetectionService } from "../../../src/modules/quote-requests/quote-duplicate-detection.service";

describe("runtime public abuse controls", () => {
  it("uses Redis port state for rate limiting, anti-spam and duplicates", async () => {
    const redis = new InMemoryRedisClient();
    const rateLimit = new PublicQuoteRateLimitService(redis, 1, 60);
    const antiSpam = new PublicAntiSpamService(redis);
    const duplicate = new QuoteDuplicateDetectionService(redis, 60);

    await expect(rateLimit.assertAllowed("127.0.0.1", "ci", "auto")).resolves.toBeUndefined();
    await expect(rateLimit.assertAllowed("127.0.0.1", "ci", "auto")).rejects.toThrow("Rate limit exceeded");
    await expect(antiSpam.assertClean({ sessionId: "s1", answers: { website: "bot" } })).rejects.toThrow("Spam submission blocked");
    await expect(duplicate.evaluate("ci", "auto", "contact-hash")).resolves.toBe("unique");
    await expect(duplicate.evaluate("ci", "auto", "contact-hash")).resolves.toBe("blocked_duplicate");
  });
});
