import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { PrismaService } from "../common/prisma/prisma.service";

export interface UserAccount {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  roles: AssurMatchRole[];
  status: "invited" | "active" | "suspended" | "locked" | "deleted";
  mfaStatus: "not_enrolled" | "enrolled" | "required" | "verified";
  partnerTenantId?: string;
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
  mfaBackupCodesHashes: string[];
  passwordResetTokenHash?: string;
  passwordResetTokenExpiresAt?: Date;
  deletedAt?: Date;
  lastLoginAt?: Date;
  lastLoginIpHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsersRepository {
  readonly mode: "memory-test" | "prisma-runtime";
  create(user: UserAccount): Promise<UserAccount>;
  update(user: UserAccount): Promise<UserAccount>;
  findById(id: string): Promise<UserAccount | undefined>;
  findByEmail(email: string): Promise<UserAccount | undefined>;
  list(): Promise<UserAccount[]>;
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
    if (!this.users.has(user.id)) throw new Error(`User ${user.id} not found`);
    this.users.set(user.id, { ...user, updatedAt: new Date() });
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

  private async require(id: string): Promise<UserAccount> {
    const user = await this.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }
}

interface PrismaUserDelegate {
  findMany(input?: unknown): Promise<PrismaUserRow[]>;
  findUnique(input: unknown): Promise<PrismaUserRow | null>;
  findFirst(input: unknown): Promise<PrismaUserRow | null>;
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<PrismaUserRow>;
}

interface PrismaRoleDelegate {
  upsert(input: unknown): Promise<{ id: string; key: string }>;
}

interface PrismaUserRoleDelegate {
  create(input: unknown): Promise<unknown>;
  deleteMany(input: unknown): Promise<unknown>;
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
    const row = await this.delegate.update({ where: { id: user.id }, data: this.toPrismaUpdate(user) });
    await this.replaceRoles(user.id, user.roles, "user-updated");
    return this.toDomain(row);
  }

  async findById(id: string): Promise<UserAccount | undefined> {
    const row = await this.delegate.findUnique({ where: { id }, include: this.includeRoles() });
    return row ? this.toDomain(row) : undefined;
  }

  async findByEmail(email: string): Promise<UserAccount | undefined> {
    const row = await this.delegate.findFirst({ where: { email: email.toLowerCase() }, include: this.includeRoles() });
    return row ? this.toDomain(row) : undefined;
  }

  async list(): Promise<UserAccount[]> {
    const rows = await this.delegate.findMany({ include: this.includeRoles(), orderBy: { createdAt: "asc" } });
    return rows.map((row) => this.toDomain(row));
  }

  async findManyRaw(): Promise<unknown[]> {
    return this.delegate.findMany();
  }

  private async requireById(id: string): Promise<UserAccount> {
    const user = await this.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
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

  private async replaceRoles(userId: string, roles: AssurMatchRole[], reason: string): Promise<void> {
    await this.userRoleDelegate.deleteMany({ where: { userId } });
    for (const roleKey of roles) {
      const role = await this.roleDelegate.upsert({
        where: { key: roleKey },
        create: { key: roleKey, name: roleKey, description: roleKey, isSystemRole: true },
        update: { name: roleKey, description: roleKey, isSystemRole: true }
      });
      await this.userRoleDelegate.create({ data: { userId, roleId: role.id, reason } });
    }
  }

  private includeRoles(): Record<string, unknown> {
    return { userRoles: { include: { role: true } } };
  }

  private toPrisma(user: UserAccount): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email.toLowerCase(),
      phone: user.phone,
      displayName: user.displayName,
      status: user.status,
      mfaStatus: user.mfaStatus,
      lastLoginAt: user.lastLoginAt,
      passwordHash: user.passwordHash,
      passwordChangedAt: user.passwordChangedAt,
      passwordChangeRequired: user.passwordChangeRequired,
      failedLoginCount: user.failedLoginCount,
      lastFailedLoginAt: user.lastFailedLoginAt,
      lockedAt: user.lockedAt,
      lockedReason: user.lockedReason,
      mfaSecretEncrypted: user.mfaSecretEncrypted,
      mfaSecretIssuedAt: user.mfaSecretIssuedAt,
      mfaBackupCodesHashes: user.mfaBackupCodesHashes,
      passwordResetTokenHash: user.passwordResetTokenHash,
      passwordResetTokenExpiresAt: user.passwordResetTokenExpiresAt,
      deletedAt: user.deletedAt,
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
    return data;
  }

  private toDomain(row: PrismaUserRow): UserAccount {
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
