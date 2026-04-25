import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { InMemoryRedisClient } from "../common/redis/redis.module";

export type DuplicateDecision = "unique" | "possible_duplicate" | "blocked_duplicate";

export class QuoteDuplicateDetectionService {
  constructor(private readonly redis: InMemoryRedisClient, private readonly ttlSeconds = 30 * 24 * 60 * 60) {}

  async evaluate(countryId: string, productId: string, contactFingerprint: string): Promise<DuplicateDecision> {
    const key = QuoteRedisKeys.duplicate(countryId, productId, contactFingerprint);
    const existing = await this.redis.get(key);
    if (existing) return "blocked_duplicate";
    await this.redis.set(key, "1", this.ttlSeconds);
    return "unique";
  }
}
