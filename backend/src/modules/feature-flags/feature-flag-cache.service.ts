import type { RedisClientPort } from "../common/redis/redis.module";

export interface CachedFlag {
  key: string;
  scopeType: string;
  scopeId?: string;
  value: boolean;
  cacheVersion: number;
}

function cacheKey(key: string, scopeType: string, scopeId?: string): string {
  return `flag:${key}:${scopeType}:${scopeId ?? "global"}`;
}

export class FeatureFlagCacheService {
  private coherent = true;

  constructor(private readonly redis: RedisClientPort) {}

  markIncoherent(): void {
    this.coherent = false;
  }

  markCoherent(): void {
    this.coherent = true;
  }

  async put(flag: CachedFlag): Promise<void> {
    await this.redis.set(cacheKey(flag.key, flag.scopeType, flag.scopeId), JSON.stringify(flag), 120);
    this.coherent = true;
  }

  async get(key: string, scopeType: string, scopeId?: string): Promise<CachedFlag | null> {
    if (!this.coherent) return null;
    const raw = await this.redis.get(cacheKey(key, scopeType, scopeId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedFlag;
  }

  async invalidate(key: string, scopeType: string, scopeId?: string): Promise<void> {
    await this.redis.del(cacheKey(key, scopeType, scopeId));
  }

  isFailClosed(key: string, scopeType: string, scopeId?: string): Promise<boolean> {
    return this.get(key, scopeType, scopeId).then((flag) => flag?.value ?? false);
  }
}
