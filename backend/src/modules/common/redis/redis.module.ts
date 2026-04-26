import { createClient, type RedisClientType } from "redis";
import { isTestEnvironment, validateRuntimeEnvironment } from "../../../config/config.module";

interface CacheValue {
  value: string;
  expiresAt?: number;
}

export interface RedisClientPort {
  readonly mode: "memory-test" | "redis-client";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  health(): Promise<"ok" | "degraded" | "down">;
}

export class InMemoryRedisClient implements RedisClientPort {
  readonly mode = "memory-test" as const;
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

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (await this.get(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const value = await this.get(key);
    if (value !== null) await this.set(key, value, ttlSeconds);
  }

  async health(): Promise<"ok"> {
    return "ok";
  }
}

export class RuntimeRedisClient implements RedisClientPort {
  readonly mode = "redis-client" as const;
  private connected = false;

  constructor(private readonly client: RedisClientType) {}

  private async ensureConnected(): Promise<void> {
    if (this.connected || this.client.isOpen) {
      this.connected = true;
      return;
    }
    await this.client.connect();
    this.connected = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.ensureConnected();
    if (ttlSeconds) await this.client.set(key, value, { EX: ttlSeconds });
    else await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    await this.ensureConnected();
    const count = await this.client.incr(key);
    if (ttlSeconds && count === 1) await this.client.expire(key, ttlSeconds);
    return count;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.set(key, value, { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.ensureConnected();
    await this.client.expire(key, ttlSeconds);
  }

  async health(): Promise<"ok" | "down"> {
    try {
      await this.ensureConnected();
      await this.client.ping();
      return "ok";
    } catch {
      return "down";
    }
  }
}

export class RedisModule {
  readonly client: RedisClientPort;
  readonly runtimeClient?: RedisClientType;
  readonly runtimeMode: "memory-test" | "redis-client";

  constructor() {
    validateRuntimeEnvironment();
    const redisUrl = process.env.REDIS_URL;
    const useRealRedis = !isTestEnvironment() && redisUrl && process.env.ASSURMATCH_REDIS_MEMORY !== "true";
    this.runtimeMode = useRealRedis ? "redis-client" : "memory-test";
    if (useRealRedis && redisUrl) {
      this.runtimeClient = createClient({ url: redisUrl });
      this.client = new RuntimeRedisClient(this.runtimeClient);
    } else {
      this.client = new InMemoryRedisClient();
    }
  }

  async close(): Promise<void> {
    if (!this.runtimeClient?.isOpen) return;
    await this.runtimeClient.quit();
  }
}
