import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { ActorContext } from "../common/types";
import type { PrismaService } from "../common/prisma/prisma.service";

type PartnerPlan = NonNullable<ActorContext["partnerPlan"]>;

export interface UserAccount {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  roles: AssurMatchRole[];
  status: "invited" | "active" | "suspended" | "locked" | "deleted";
  mfaStatus: "not_enrolled" | "enrolled" | "required" | "verified";
  partnerTenantId?: string;
  partnerPlan?: PartnerPlan;
  countryScopes: string[];
  productScopes: string[];
  passwordHash?: string;
  passwordChangedAt?: Date;
  passwordChangeRequired: boolean;
  failedLoginCount: number;
  lastFailedLoginAt?: Date;
  lockedAt?: Date;
  lockedReason?: string;
  mfaSecretEncrypted?: string;
  mfaSecretIssuedAt?: Date;
  /** Last accepted TOTP time-step counter (replay protection); undefined = never. */
  mfaLastTotpCounter?: number;
  mfaBackupCodesHashes: string[];
  passwordResetTokenHash?: string;
  passwordResetTokenExpiresAt?: Date;
  deletedAt?: Date;
  lastLoginAt?: Date;
  lastLoginIpHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Thrown by `UsersService.require` for an unknown id: the only error a caller may read as "no such user". */
export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User ${id} not found`);
    this.name = "UserNotFoundError";
  }
}

export interface UsersRepository {
  readonly mode: "memory-test" | "prisma-runtime";
  create(user: UserAccount): Promise<UserAccount>;
  update(user: UserAccount): Promise<UserAccount>;
  findById(id: string): Promise<UserAccount | undefined>;
  findByEmail(email: string): Promise<UserAccount | undefined>;
  list(): Promise<UserAccount[]>;
  /** Atomic: accepts (and remembers) the counter only if strictly greater than the last one. */
  claimTotpCounter(userId: string, counter: number): Promise<boolean>;
  /** Clears the TOTP replay counter (MFA reset / new enrolment): the only other writer besides `claimTotpCounter`. */
  clearTotpCounter(userId: string): Promise<void>;
  /**
   * Atomic single-use backup code: blanks the entry holding `hash` and answers true only for the one
   * caller that did it; a concurrent or later presentation of the same code answers false.
   */
  consumeBackupCode(userId: string, hash: string): Promise<boolean>;
}

export class MemoryUsersRepository implements UsersRepository {
  readonly mode = "memory-test" as const;
  private readonly users = new Map<string, UserAccount>();

  async create(user: UserAccount): Promise<UserAccount> {
    if (await this.findByEmail(user.email)) throw new Error("User email already exists");
    this.users.set(user.id, { ...user });
    return this.require(user.id);
  }

  async update(user: UserAccount): Promise<UserAccount> {
    const stored = this.users.get(user.id);
    if (!stored) throw new UserNotFoundError(user.id);
    // Like Prisma's update, a generic write never touches the TOTP counter (claim/clear own it).
    const next: UserAccount = { ...user, updatedAt: new Date() };
    if (stored.mfaLastTotpCounter === undefined) delete next.mfaLastTotpCounter;
    else next.mfaLastTotpCounter = stored.mfaLastTotpCounter;
    this.users.set(user.id, next);
    return this.require(user.id);
  }

  async findById(id: string): Promise<UserAccount | undefined> {
    const user = this.users.get(id);
    return user ? { ...user } : undefined;
  }

  async findByEmail(email: string): Promise<UserAccount | undefined> {
    const normalized = email.toLowerCase();
    const user = [...this.users.values()].find((candidate) => candidate.email.toLowerCase() === normalized);
    return user ? { ...user } : undefined;
  }

  async list(): Promise<UserAccount[]> {
    return [...this.users.values()].map((user) => ({ ...user }));
  }

  async claimTotpCounter(userId: string, counter: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    if (user.mfaLastTotpCounter !== undefined && user.mfaLastTotpCounter !== null && user.mfaLastTotpCounter >= counter) return false;
    user.mfaLastTotpCounter = counter;
    return true;
  }

  async clearTotpCounter(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) delete user.mfaLastTotpCounter;
  }

  async consumeBackupCode(userId: string, hash: string): Promise<boolean> {
    // Synchronous between the read and the write: no await, so two callers cannot both see the code.
    const user = this.users.get(userId);
    if (!user || !hash) return false;
    const index = user.mfaBackupCodesHashes.indexOf(hash);
    if (index < 0) return false;
    const next = [...user.mfaBackupCodesHashes];
    next[index] = "";
    user.mfaBackupCodesHashes = next;
    return true;
  }

  private async require(id: string): Promise<UserAccount> {
    const user = await this.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }
}

interface PrismaUserDelegate {
  findMany(input?: unknown): Promise<PrismaUserRow[]>;
  findUnique(input: unknown): Promise<PrismaUserRow | null>;
  findFirst(input: unknown): Promise<PrismaUserRow | null>;
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<PrismaUserRow>;
  updateMany(input: unknown): Promise<{ count: number }>;
}

interface PrismaRoleDelegate {
  upsert(input: unknown): Promise<{ id: string; key: string }>;
}

interface PrismaUserRoleDelegate {
  create(input: unknown): Promise<unknown>;
  deleteMany(input: unknown): Promise<unknown>;
}

interface PrismaPartnerTenantDelegate {
  findMany(input: unknown): Promise<PrismaPartnerPlanRow[]>;
}

interface PrismaPartnerPlanRow {
  id: string;
  plan: string;
}

interface PrismaUserRow {
  id: string;
  email: string;
  phone?: string | null;
  displayName: string;
  status: UserAccount["status"];
  mfaStatus: UserAccount["mfaStatus"];
  lastLoginAt?: Date | null;
  passwordHash?: string | null;
  passwordChangedAt?: Date | null;
  passwordChangeRequired: boolean;
  failedLoginCount: number;
  lastFailedLoginAt?: Date | null;
  lockedAt?: Date | null;
  lockedReason?: string | null;
  mfaSecretEncrypted?: string | null;
  mfaSecretIssuedAt?: Date | null;
  mfaLastTotpCounter?: number | null;
  mfaBackupCodesHashes: string[];
  passwordResetTokenHash?: string | null;
  passwordResetTokenExpiresAt?: Date | null;
  deletedAt?: Date | null;
  lastLoginIpHash?: string | null;
  partnerTenantId?: string | null;
  countryScopes: string[];
  productScopes: string[];
  createdAt: Date;
  updatedAt: Date;
  userRoles?: Array<{ role?: { key: AssurMatchRole } | null }>;
}

export class PrismaUsersRepository implements UsersRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(user: UserAccount): Promise<UserAccount> {
    await this.delegate.create({ data: this.toPrisma(user) });
    await this.replaceRoles(user.id, user.roles, "user-created");
    return this.requireById(user.id);
  }

  async update(user: UserAccount): Promise<UserAccount> {
    await this.delegate.update({ where: { id: user.id }, data: this.toPrismaUpdate(user) });
    await this.replaceRoles(user.id, user.roles, "user-updated");
    return this.requireById(user.id);
  }

  async findById(id: string): Promise<UserAccount | undefined> {
    const row = await this.delegate.findUnique({ where: { id }, include: this.includeRoles() });
    return row ? this.toDomain(row, await this.partnerPlanFor(row.partnerTenantId)) : undefined;
  }

  async findByEmail(email: string): Promise<UserAccount | undefined> {
    const row = await this.delegate.findFirst({ where: { email: email.toLowerCase() }, include: this.includeRoles() });
    return row ? this.toDomain(row, await this.partnerPlanFor(row.partnerTenantId)) : undefined;
  }

  async list(): Promise<UserAccount[]> {
    const rows = await this.delegate.findMany({ include: this.includeRoles(), orderBy: { createdAt: "asc" } });
    const partnerPlans = await this.partnerPlansFor(rows.map((row) => row.partnerTenantId));
    return rows.map((row) => this.toDomain(row, row.partnerTenantId ? partnerPlans.get(row.partnerTenantId) : undefined));
  }

  async claimTotpCounter(userId: string, counter: number): Promise<boolean> {
    const result = await this.delegate.updateMany({
      where: { id: userId, OR: [{ mfaLastTotpCounter: null }, { mfaLastTotpCounter: { lt: counter } }] },
      data: { mfaLastTotpCounter: counter }
    });
    return result.count > 0;
  }

  async clearTotpCounter(userId: string): Promise<void> {
    await this.delegate.updateMany({ where: { id: userId }, data: { mfaLastTotpCounter: null } });
  }

  async consumeBackupCode(userId: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    // Compare-and-swap on the whole array: the write only lands if nobody changed it since the read.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await this.delegate.findUnique({ where: { id: userId }, select: { mfaBackupCodesHashes: true } });
      const current = row?.mfaBackupCodesHashes ?? [];
      const index = current.indexOf(hash);
      if (index < 0) return false;
      const next = [...current];
      next[index] = "";
      const result = await this.delegate.updateMany({ where: { id: userId, mfaBackupCodesHashes: { equals: current } }, data: { mfaBackupCodesHashes: next } });
      if (result.count > 0) return true;
    }
    return false;
  }

  async findManyRaw(): Promise<unknown[]> {
    return this.delegate.findMany();
  }

  private async requireById(id: string): Promise<UserAccount> {
    const user = await this.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }

  private get delegate(): PrismaUserDelegate {
    const client = this.prisma.requireRuntimeClient();
    const user = client.user as PrismaUserDelegate | undefined;
    if (!user) throw new Error("Prisma user delegate is not connected");
    return user;
  }

  private get roleDelegate(): PrismaRoleDelegate {
    const client = this.prisma.requireRuntimeClient();
    const role = client.role as PrismaRoleDelegate | undefined;
    if (!role) throw new Error("Prisma role delegate is not connected");
    return role;
  }

  private get userRoleDelegate(): PrismaUserRoleDelegate {
    const client = this.prisma.requireRuntimeClient();
    const userRole = client.userRole as PrismaUserRoleDelegate | undefined;
    if (!userRole) throw new Error("Prisma userRole delegate is not connected");
    return userRole;
  }

  private get partnerTenantDelegate(): PrismaPartnerTenantDelegate | undefined {
    const client = this.prisma.requireRuntimeClient();
    return (client as { partnerTenant?: PrismaPartnerTenantDelegate }).partnerTenant;
  }

  /**
   * Rewrites the roles only when they changed, and then inside one transaction, so that a failure in the
   * middle can no longer leave the user without any role (a role-less user is refused at the guard).
   */
  private async replaceRoles(userId: string, roles: AssurMatchRole[], reason: string): Promise<void> {
    const current = await this.delegate.findUnique({ where: { id: userId }, include: this.includeRoles() });
    const currentKeys = (current?.userRoles ?? []).map((userRole) => userRole.role?.key).filter((key): key is AssurMatchRole => !!key);
    if (currentKeys.length === roles.length && [...currentKeys].sort().join(",") === [...roles].sort().join(",")) return;
    const client = this.prisma.requireRuntimeClient();
    const run = async (roleDelegate: PrismaRoleDelegate, userRoleDelegate: PrismaUserRoleDelegate): Promise<void> => {
      await userRoleDelegate.deleteMany({ where: { userId } });
      for (const roleKey of roles) {
        const role = await roleDelegate.upsert({
          where: { key: roleKey },
          create: { key: roleKey, name: roleKey, description: roleKey, isSystemRole: true },
          update: { name: roleKey, description: roleKey, isSystemRole: true }
        });
        await userRoleDelegate.create({ data: { userId, roleId: role.id, reason } });
      }
    };
    const interactive = (client as unknown as { $transaction?: (callback: (tx: Record<string, unknown>) => Promise<void>) => Promise<void> }).$transaction;
    if (typeof interactive !== "function") return run(this.roleDelegate, this.userRoleDelegate);
    await interactive.call(client, (tx) => {
      const txRole = tx.role as PrismaRoleDelegate | undefined;
      const txUserRole = tx.userRole as PrismaUserRoleDelegate | undefined;
      if (!txRole || !txUserRole) throw new Error("Prisma transaction delegates are not available");
      return run(txRole, txUserRole);
    });
  }

  private includeRoles(): Record<string, unknown> {
    return { userRoles: { include: { role: true } } };
  }

  private toPrisma(user: UserAccount): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email.toLowerCase(),
      phone: user.phone ?? null,
      displayName: user.displayName,
      status: user.status,
      mfaStatus: user.mfaStatus,
      lastLoginAt: user.lastLoginAt ?? null,
      passwordHash: user.passwordHash ?? null,
      passwordChangedAt: user.passwordChangedAt,
      passwordChangeRequired: user.passwordChangeRequired,
      failedLoginCount: user.failedLoginCount,
      lastFailedLoginAt: user.lastFailedLoginAt ?? null,
      lockedAt: user.lockedAt ?? null,
      lockedReason: user.lockedReason ?? null,
      mfaSecretEncrypted: user.mfaSecretEncrypted ?? null,
      mfaSecretIssuedAt: user.mfaSecretIssuedAt ?? null,
      mfaLastTotpCounter: user.mfaLastTotpCounter ?? null,
      mfaBackupCodesHashes: user.mfaBackupCodesHashes,
      passwordResetTokenHash: user.passwordResetTokenHash ?? null,
      passwordResetTokenExpiresAt: user.passwordResetTokenExpiresAt ?? null,
      deletedAt: user.deletedAt ?? null,
      lastLoginIpHash: user.lastLoginIpHash,
      partnerTenantId: user.partnerTenantId,
      countryScopes: user.countryScopes,
      productScopes: user.productScopes,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  private toPrismaUpdate(user: UserAccount): Record<string, unknown> {
    const data = this.toPrisma(user);
    delete data.id;
    delete data.createdAt;
    // The replay counter is written only by claimTotpCounter / clearTotpCounter: a generic write of a
    // stale object must never roll it back.
    delete data.mfaLastTotpCounter;
    return data;
  }

  private async partnerPlanFor(partnerTenantId?: string | null): Promise<PartnerPlan | undefined> {
    if (!partnerTenantId) return undefined;
    return (await this.partnerPlansFor([partnerTenantId])).get(partnerTenantId);
  }

  private async partnerPlansFor(partnerTenantIds: Array<string | null | undefined>): Promise<Map<string, PartnerPlan>> {
    const ids = [...new Set(partnerTenantIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const partnerTenant = this.partnerTenantDelegate;
    if (!partnerTenant) return new Map();
    const rows = await partnerTenant.findMany({ where: { id: { in: ids } }, select: { id: true, plan: true } });
    return new Map(
      rows
        .filter((row): row is PrismaPartnerPlanRow & { plan: PartnerPlan } => this.isPartnerPlan(row.plan))
        .map((row) => [row.id, row.plan])
    );
  }

  private isPartnerPlan(plan: string): plan is PartnerPlan {
    return plan === "starter" || plan === "pro" || plan === "enterprise";
  }

  private toDomain(row: PrismaUserRow, partnerPlan?: PartnerPlan): UserAccount {
    const roles = row.userRoles?.map((userRole) => userRole.role?.key).filter((role): role is AssurMatchRole => !!role) ?? [];
    return {
      id: row.id,
      email: row.email,
      ...(row.phone ? { phone: row.phone } : {}),
      displayName: row.displayName,
      roles,
      status: row.status,
      mfaStatus: row.mfaStatus,
      ...(row.partnerTenantId ? { partnerTenantId: row.partnerTenantId } : {}),
      ...(partnerPlan ? { partnerPlan } : {}),
      countryScopes: row.countryScopes,
      productScopes: row.productScopes,
      ...(row.passwordHash ? { passwordHash: row.passwordHash } : {}),
      ...(row.passwordChangedAt ? { passwordChangedAt: row.passwordChangedAt } : {}),
      passwordChangeRequired: row.passwordChangeRequired,
      failedLoginCount: row.failedLoginCount,
      ...(row.lastFailedLoginAt ? { lastFailedLoginAt: row.lastFailedLoginAt } : {}),
      ...(row.lockedAt ? { lockedAt: row.lockedAt } : {}),
      ...(row.lockedReason ? { lockedReason: row.lockedReason } : {}),
      ...(row.mfaSecretEncrypted ? { mfaSecretEncrypted: row.mfaSecretEncrypted } : {}),
      ...(row.mfaSecretIssuedAt ? { mfaSecretIssuedAt: row.mfaSecretIssuedAt } : {}),
      ...(row.mfaLastTotpCounter !== null && row.mfaLastTotpCounter !== undefined ? { mfaLastTotpCounter: row.mfaLastTotpCounter } : {}),
      mfaBackupCodesHashes: row.mfaBackupCodesHashes,
      ...(row.passwordResetTokenHash ? { passwordResetTokenHash: row.passwordResetTokenHash } : {}),
      ...(row.passwordResetTokenExpiresAt ? { passwordResetTokenExpiresAt: row.passwordResetTokenExpiresAt } : {}),
      ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
      ...(row.lastLoginAt ? { lastLoginAt: row.lastLoginAt } : {}),
      ...(row.lastLoginIpHash ? { lastLoginIpHash: row.lastLoginIpHash } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
