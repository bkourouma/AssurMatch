import type { InMemoryRedisClient } from "../common/redis/redis.module";

export class CatalogCacheService {
  constructor(private readonly redis: InMemoryRedisClient) {}

  async invalidateCountry(countryId: string): Promise<void> {
    await this.redis.del(`catalog:country:${countryId}`);
    await this.redis.del("catalog:countries:public");
  }

  async invalidateProduct(productId: string): Promise<void> {
    await this.redis.del(`catalog:product:${productId}`);
    await this.redis.del("catalog:products:public");
  }
}
