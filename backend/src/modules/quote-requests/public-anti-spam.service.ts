import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { InMemoryRedisClient } from "../common/redis/redis.module";

export class PublicAntiSpamService {
  constructor(private readonly redis: InMemoryRedisClient) {}

  async assertClean(input: { sessionId?: string; answers: Record<string, unknown> }): Promise<void> {
    if (typeof input.answers.website === "string" && input.answers.website.trim().length > 0) {
      throw new Error("Spam submission blocked");
    }
    if (input.sessionId) {
      const key = QuoteRedisKeys.spamSession(input.sessionId);
      const count = await this.redis.incr(key, 300);
      if (count > 10) throw new Error("Spam submission blocked");
    }
  }
}
