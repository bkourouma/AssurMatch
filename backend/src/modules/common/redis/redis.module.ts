import { createClient, type RedisClientType } from "redis";

interface CacheValue {
  value: string;
  expiresAt?: number;
}

export class InMemoryRedisClient {
  private readonly values = new Map<string, CacheValue>();

  async get(key: string): Promise<string | null> {
    const value = this.values.get(key);
    if (!value) return null;
    if (value.expiresAt && value.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return value.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.values.set(key, {
      value,
      ...(ttlSeconds ? { expiresAt: Date.now() + ttlSeconds * 1000 } : {})
    });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const current = Number.parseInt((await this.get(key)) ?? "0", 10) + 1;
    await this.set(key, String(current), ttlSeconds);
    return current;
  }

  async health(): Promise<"ok"> {
    return "ok";
  }
}

export class RedisModule {
  readonly client = new InMemoryRedisClient();
  readonly runtimeClient?: RedisClientType;
  readonly runtimeMode: "memory-test" | "redis-client";

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const useRealRedis = process.env.NODE_ENV !== "test" && redisUrl && process.env.ASSURMATCH_REDIS_MEMORY !== "true";
    this.runtimeMode = useRealRedis ? "redis-client" : "memory-test";
    if (useRealRedis && redisUrl) {
      this.runtimeClient = createClient({ url: redisUrl });
    }
  }
}
