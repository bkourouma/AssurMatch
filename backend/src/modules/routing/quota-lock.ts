import type { RedisClientPort } from "../common/redis/redis.module";
import { RoutingLockTimeoutError, type RoutingLockPort } from "./routing-controls.ports";

export interface QuotaLockOptions {
  /** Lifetime of a Redis lock: a crashed holder can block a broker's quota for at most this long. */
  ttlSeconds?: number;
  /** Total time allowed to take every key before `RoutingLockTimeoutError`. */
  timeoutMs?: number;
  /** Pause between two `SET NX` attempts on a busy key. */
  retryDelayMs?: number;
  keyPrefix?: string;
}

export const QUOTA_LOCK_DEFAULTS = { ttlSeconds: 10, timeoutMs: 5_000, retryDelayMs: 50, keyPrefix: "lock:routing:quota:" } as const;

/** Lock key of one broker monthly quota (prefixed like `QuoteRedisKeys.routingLock`: `lock:routing:quota:<id>`). */
export function quotaLockKey(partnerTenantId: string): string {
  return partnerTenantId;
}

/**
 * Lot 5 (spec 071, ROUTE-003): exclusive lock on the quota consumption of brokers.
 *
 * Two layers, always in this order:
 * 1. an in-process FIFO mutex per key, so concurrent routings of the same API process queue up
 *    without hammering Redis (and so the memory runtime, which has no Redis, stays correct);
 * 2. when a Redis client is given, `SET key token NX EX ttl` with a bounded retry, so several API
 *    instances never consume the same quota concurrently. The token identifies the owner: a holder
 *    only deletes the key while it still holds its own token.
 *
 * Keys are sorted and de-duplicated before acquisition, so two routings sharing brokers can never
 * wait on each other in opposite orders (no deadlock). Every acquisition failure releases what was
 * already taken. A Redis error is treated like a busy key (fail closed): the caller ends with
 * `RoutingLockTimeoutError` instead of consuming a quota it could not protect.
 */
export class QuotaLock implements RoutingLockPort {
  private readonly ttlSeconds: number;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly keyPrefix: string;
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly redis?: RedisClientPort | undefined, options: QuotaLockOptions = {}) {
    this.ttlSeconds = Math.max(1, Math.ceil(options.ttlSeconds ?? QUOTA_LOCK_DEFAULTS.ttlSeconds));
    this.timeoutMs = Math.max(0, options.timeoutMs ?? QUOTA_LOCK_DEFAULTS.timeoutMs);
    this.retryDelayMs = Math.max(1, options.retryDelayMs ?? QUOTA_LOCK_DEFAULTS.retryDelayMs);
    this.keyPrefix = options.keyPrefix ?? QUOTA_LOCK_DEFAULTS.keyPrefix;
  }

  async withLock<T>(keys: string[], task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(keys);
    try {
      return await task();
    } finally {
      await release();
    }
  }

  async acquire(keys: string[]): Promise<() => Promise<void>> {
    const ordered = [...new Set(keys)].sort();
    const deadline = Date.now() + this.timeoutMs;
    const releases: Array<() => Promise<void>> = [];
    const releaseAll = async (): Promise<void> => {
      for (const release of releases.splice(0).reverse()) await release();
    };
    try {
      for (const key of ordered) releases.push(await this.acquireOne(key, deadline));
    } catch (error) {
      await releaseAll();
      throw error;
    }
    return releaseAll;
  }

  private async acquireOne(key: string, deadline: number): Promise<() => Promise<void>> {
    const releaseLocal = await this.acquireLocal(key, deadline);
    if (!this.redis) return async () => releaseLocal();
    const redisKey = `${this.keyPrefix}${key}`;
    const token = crypto.randomUUID();
    try {
      for (;;) {
        const taken = await this.redis.setNx(redisKey, token, this.ttlSeconds).catch(() => false);
        if (taken) break;
        if (Date.now() + this.retryDelayMs > deadline) throw new RoutingLockTimeoutError(key);
        await sleep(this.retryDelayMs);
      }
    } catch (error) {
      releaseLocal();
      throw error;
    }
    return async () => {
      try {
        // Compare-then-delete: never remove a lock that expired and was taken by another owner.
        // (The port has no atomic compare-and-delete; the residual window is bounded by the TTL.)
        if (await this.redis?.get(redisKey) === token) await this.redis?.del(redisKey);
      } catch {
        // The TTL frees the key anyway; a failed release must not fail the routing.
      } finally {
        releaseLocal();
      }
    };
  }

  /** FIFO mutex per key. A waiter that times out still passes its turn on, so the queue never stalls. */
  private async acquireLocal(key: string, deadline: number): Promise<() => void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    const settle = (): void => {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const turn = await Promise.race([
      previous.then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now())); })
    ]);
    if (timer) clearTimeout(timer);
    if (!turn) {
      void previous.then(settle);
      throw new RoutingLockTimeoutError(key);
    }
    return settle;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
