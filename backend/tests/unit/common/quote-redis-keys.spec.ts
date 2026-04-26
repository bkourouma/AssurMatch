import { describe, expect, it } from "vitest";
import { QuoteRedisKeys } from "../../../src/modules/common/redis/quote-redis-keys";

describe("QuoteRedisKeys", () => {
  it("hashes IP, session and contact inputs so raw PII is absent", async () => {
    const keys = [
      QuoteRedisKeys.publicCatalogRateLimit("203.0.113.8"),
      QuoteRedisKeys.quoteRateLimit("203.0.113.8", "country-ci", "product-auto"),
      QuoteRedisKeys.spamSession("visitor-session-123"),
      QuoteRedisKeys.duplicate("country-ci", "product-auto", QuoteRedisKeys.contactFingerprint("country-ci", "product-auto", "visitor@example.com", "+2250102030405"))
    ];

    const joined = keys.join("\n");
    expect(joined).not.toContain("203.0.113.8");
    expect(joined).not.toContain("visitor@example.com");
    expect(joined).not.toContain("+2250102030405");
    expect(joined).not.toContain("visitor-session-123");
  });
});
