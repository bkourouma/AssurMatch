import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";

export type DuplicateDecision = "unique" | "possible_duplicate" | "blocked_duplicate";

export class QuoteDuplicateDetectionService {
  constructor(private readonly redis: RedisClientPort, private readonly ttlSeconds = 30 * 24 * 60 * 60) {}

  /**
   * Same e-mail within the window: blocked. Spec 066 F1: the same phone with another e-mail is only
   * a signal (`possible_duplicate`); the request goes on with its own contact and its own profile.
   */
  async evaluate(countryId: string, productId: string, contactFingerprint: string, phoneFingerprint?: string): Promise<DuplicateDecision> {
    const key = QuoteRedisKeys.duplicate(countryId, productId, contactFingerprint);
    const existing = await this.redis.get(key);
    if (existing) return "blocked_duplicate";
    await this.redis.set(key, "1", this.ttlSeconds);
    if (!phoneFingerprint) return "unique";
    const phoneKey = QuoteRedisKeys.duplicate(countryId, productId, `phone:${phoneFingerprint}`);
    const phoneSeen = await this.redis.get(phoneKey);
    await this.redis.set(phoneKey, "1", this.ttlSeconds);
    return phoneSeen ? "possible_duplicate" : "unique";
  }
}
