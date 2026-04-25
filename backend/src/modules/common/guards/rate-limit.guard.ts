import type { InMemoryRedisClient } from "../redis/redis.module";

export class RateLimitGuard {
  constructor(private readonly redis: InMemoryRedisClient, private readonly maxRequests = 60, private readonly windowSeconds = 60) {}

  async assertAllowed(key: string): Promise<void> {
    const count = await this.redis.incr(`rate:${key}`, this.windowSeconds);
    if (count > this.maxRequests) {
      throw new Error("Rate limit exceeded");
    }
  }
}
