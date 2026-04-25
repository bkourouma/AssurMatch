import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { QuoteDuplicateDetectionService } from "../../../src/modules/quote-requests/quote-duplicate-detection.service";

describe("QuoteDuplicateDetectionService", () => {
  it("marks repeated salted contact fingerprints as blocked duplicates", async () => {
    const service = new QuoteDuplicateDetectionService(new InMemoryRedisClient());
    const fingerprint = "hashed-contact";

    await expect(service.evaluate("country", "product", fingerprint)).resolves.toBe("unique");
    await expect(service.evaluate("country", "product", fingerprint)).resolves.toBe("blocked_duplicate");
  });
});
