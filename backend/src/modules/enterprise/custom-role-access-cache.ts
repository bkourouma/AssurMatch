import type { ActorContext } from "../common/types";

/** Spec 064 (FR-007): a restriction change applies within this delay at the latest, immediately on this process. */
export const CUSTOM_ROLE_ACCESS_TTL_MS = 10_000;

/** What the auth guard puts on the actor: the custom role of the member and its effective permissions. */
export interface ResolvedCustomRole {
  id: string;
  name: string;
  /** Base role intersected with the custom role, limited to the custom permission catalogue. */
  permissions: string[];
}

/** Port read by the auth guard on every broker request. A rejection means "unknown": the guard fails closed. */
export interface CustomRoleAccessPort {
  resolve(actor: ActorContext): Promise<ResolvedCustomRole | undefined>;
}

interface CacheEntry {
  value: ResolvedCustomRole | undefined;
  expiresAt: number;
}

/**
 * Short-lived cache in front of the custom role lookup, so a protected request does not read the
 * roles of the tenant every time. "No custom role" is cached too (it is the common case).
 * `invalidate(userId)` is called on every assignment and `invalidate()` on every role update, which
 * makes the change effective on the next request of this process; another process converges within
 * the TTL. The loader is never allowed to fail silently: an error is not cached and is rethrown.
 */
export class CustomRoleAccessCache implements CustomRoleAccessPort {
  private readonly entries = new Map<string, CacheEntry>();
  /** Bumped on every invalidation so a load that started before it cannot store a stale answer. */
  private epoch = 0;

  constructor(
    private readonly load: (actor: ActorContext) => Promise<ResolvedCustomRole | undefined>,
    private readonly ttlMs: number = CUSTOM_ROLE_ACCESS_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  async resolve(actor: ActorContext): Promise<ResolvedCustomRole | undefined> {
    const key = this.keyFor(actor);
    if (!key) return this.load(actor);
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const startedAt = this.epoch;
    const value = await this.load(actor);
    if (startedAt === this.epoch) this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  /** Drops the entries of one member, or every entry when no member is given. */
  invalidate(userId?: string): void {
    this.epoch += 1;
    if (!userId) {
      this.entries.clear();
      return;
    }
    const prefix = `${userId}|`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /** The permissions depend on the base roles and the tenant as well as on the member. */
  private keyFor(actor: ActorContext): string | undefined {
    if (!actor.actorId || !actor.partnerTenantId) return undefined;
    return `${actor.actorId}|${actor.partnerTenantId}|${[...actor.roles].sort().join(",")}`;
  }
}
