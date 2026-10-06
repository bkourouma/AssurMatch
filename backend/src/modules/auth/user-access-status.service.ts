import type { UserAccount } from "../users/users.repository";

/** Same short TTL as the partner status cache (spec 051 R12); an explicit invalidation is immediate. */
export const USER_ACCESS_STATUS_TTL_MS = 30_000;

/** Statuses that end the access of a broker user whatever the validity of the token (spec 053 R6). */
const BLOCKED_STATUSES = new Set<UserAccount["status"]>(["suspended", "locked", "deleted"]);

export interface UserAccessSnapshot {
  status: UserAccount["status"];
  roles: string[];
}

export interface UserAccessStatusPort {
  /** Undefined for an unknown user id (no restriction). */
  snapshot(userId: string): Promise<UserAccessSnapshot | undefined>;
}

/**
 * Spec 053 R6 / FR-011: access tokens are stateless (15 minutes), so a broker user deactivated by
 * the owner would keep working until expiry. The auth guard reads this snapshot on every protected
 * request of a broker actor and answers 401 when the account is suspended, locked or deleted, or
 * when its roles changed since the token was issued (the user signs in again and gets the new
 * roles). Cached per user with a short TTL; the team service invalidates the entry on each change.
 */
export class UserAccessStatusService implements UserAccessStatusPort {
  private readonly cache = new Map<string, { snapshot: UserAccessSnapshot | undefined; expiresAt: number }>();

  constructor(
    private readonly users: { require(id: string): Promise<UserAccount> },
    private readonly ttlMs = USER_ACCESS_STATUS_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  async snapshot(userId: string): Promise<UserAccessSnapshot | undefined> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > this.now()) return cached.snapshot;
    const user = await this.users.require(userId).catch(() => undefined);
    const snapshot = user ? { status: user.status, roles: [...user.roles] } : undefined;
    this.cache.set(userId, { snapshot, expiresAt: this.now() + this.ttlMs });
    return snapshot;
  }

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}

/** True when the stored account no longer allows the token's access (blocked status or other roles). */
export function userAccessRevoked(snapshot: UserAccessSnapshot, tokenRoles: readonly string[]): boolean {
  if (BLOCKED_STATUSES.has(snapshot.status)) return true;
  const stored = [...snapshot.roles].sort().join(",");
  const claimed = [...tokenRoles].sort().join(",");
  return stored !== claimed;
}
