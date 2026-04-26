import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";

export class PublicQuoteRateLimitService {
  constructor(private readonly redis: RedisClientPort, private readonly limit = 5, private readonly ttlSeconds = 60) {}

  async assertAllowed(ipAddress: string, countryId: string, productId: string): Promise<void> {
    const count = await this.redis.incr(QuoteRedisKeys.quoteRateLimit(ipAddress, countryId, productId), this.ttlSeconds);
    if (count > this.limit) throw new Error("Rate limit exceeded");
  }
}
