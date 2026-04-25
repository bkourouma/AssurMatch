import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { InMemoryRedisClient } from "../common/redis/redis.module";

export class OfferCacheService {
  constructor(private readonly redis: InMemoryRedisClient) {}

  key(countryCode: string, productKey: string, filterHash: string): string {
    return QuoteRedisKeys.catalogOffers(countryCode, productKey, filterHash);
  }

  async set(countryCode: string, productKey: string, filterHash: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.key(countryCode, productKey, filterHash), value, ttlSeconds);
  }

  async get(countryCode: string, productKey: string, filterHash: string): Promise<string | null> {
    return this.redis.get(this.key(countryCode, productKey, filterHash));
  }
}
