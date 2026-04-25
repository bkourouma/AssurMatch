import { describe, expect, it } from "vitest";
import { QuoteRedisKeys } from "../../../src/modules/common/redis/quote-redis-keys";

describe("Redis PII guardrails", () => {
  it("does not expose raw email, phone, names or free-text answers in quote keys", () => {
    const key = [
      QuoteRedisKeys.contactFingerprint("country", "product", "Alice@example.com", "+2250102030405"),
      QuoteRedisKeys.quoteRateLimit("203.0.113.10", "country", "product"),
      QuoteRedisKeys.spamSession("alice-session")
    ].join(":");

    ["Alice", "Alice@example.com", "+2250102030405", "alice-session", "free text answer"].forEach((pii) => {
      expect(key).not.toContain(pii);
    });
  });
});
