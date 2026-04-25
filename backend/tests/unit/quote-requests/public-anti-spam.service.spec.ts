import { describe, expect, it } from "vitest";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { PublicAntiSpamService } from "../../../src/modules/quote-requests/public-anti-spam.service";

describe("PublicAntiSpamService", () => {
  it("blocks honeypot and session bursts without storing raw form PII", async () => {
    const service = new PublicAntiSpamService(new InMemoryRedisClient());

    await expect(service.assertClean({ answers: { website: "spam.example" } })).rejects.toThrow("Spam submission blocked");
    for (let count = 0; count < 10; count += 1) {
      await service.assertClean({ sessionId: "session-1", answers: {} });
    }
    await expect(service.assertClean({ sessionId: "session-1", answers: {} })).rejects.toThrow("Spam submission blocked");
  });
});
