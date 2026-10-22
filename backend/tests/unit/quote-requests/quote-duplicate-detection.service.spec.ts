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

  it("flags a phone seen with another e-mail as a possible duplicate without blocking it (spec 066)", async () => {
    const service = new QuoteDuplicateDetectionService(new InMemoryRedisClient());

    await expect(service.evaluate("country", "product", "email-a", "phone-1")).resolves.toBe("unique");
    await expect(service.evaluate("country", "product", "email-b", "phone-1")).resolves.toBe("possible_duplicate");
    await expect(service.evaluate("country", "product", "email-b", "phone-1")).resolves.toBe("blocked_duplicate");
    await expect(service.evaluate("country", "product", "email-c", "phone-2")).resolves.toBe("unique");
  });
});
