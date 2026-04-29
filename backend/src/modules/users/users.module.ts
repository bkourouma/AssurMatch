import { userCreateSchema, type UserCreateDto } from "../../../../packages/shared/contracts/auth.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryUsersRepository, type UserAccount, type UsersRepository } from "./users.repository";

export type { UserAccount } from "./users.repository";

export class UsersService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: UsersRepository = new MemoryUsersRepository()) {}

  async create(input: UserCreateDto, actor: ActorContext): Promise<UserAccount> {
    const parsed = userCreateSchema.parse(input);
    const now = new Date();
    const user = await this.repository.create({
      id: parsed.id ?? crypto.randomUUID(),
      email: parsed.email,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      displayName: parsed.displayName,
      roles: parsed.roles as AssurMatchRole[],
      status: "invited",
      mfaStatus: "required",
      ...(parsed.partnerTenantId ? { partnerTenantId: parsed.partnerTenantId } : {}),
      countryScopes: parsed.scopes.countryIds,
      productScopes: parsed.scopes.productIds,
      passwordChangeRequired: true,
      failedLoginCount: 0,
      mfaBackupCodesHashes: [],
      createdAt: now,
      updatedAt: now
    });
    this.audit.write({
      actor,
      action: AuthAuditActions.userCreated,
      targetType: "User",
      targetId: user.id,
      result: "success",
      context: { email: user.email, roles: user.roles }
    });
    return user;
  }

  async updateRoles(userId: string, roles: AssurMatchRole[], reason: string, actor: ActorContext): Promise<UserAccount> {
    const user = await this.require(userId);
    user.roles = roles;
    const updated = await this.repository.update(user);
    this.audit.write({
      actor,
      action: AuthAuditActions.userRoleChanged,
      targetType: "User",
      targetId: user.id,
      result: "success",
      reason,
      context: { roles }
    });
    return updated;
  }

  async list(actor: ActorContext): Promise<UserAccount[]> {
    const users = (await this.repository.list()).filter((user) => user.status !== "deleted");
    if (actor.roles.includes("super_admin")) return users;
    if (actor.partnerTenantId) return users.filter((user) => user.partnerTenantId === actor.partnerTenantId);
    return users.filter((user) =>
      user.countryScopes.some((countryId) => actor.countryScopes?.includes(countryId))
    );
  }

  async findByEmail(email: string): Promise<UserAccount | undefined> {
    const user = await this.repository.findByEmail(email);
    return user?.status === "deleted" ? undefined : user;
  }

  update(user: UserAccount): Promise<UserAccount> {
    return this.repository.update(user);
  }

  async setPassword(userId: string, passwordHash: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.passwordChangeRequired = false;
    return this.repository.update(user);
  }

  async setPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<UserAccount> {
    const user = await this.require(userId);
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetTokenExpiresAt = expiresAt;
    return this.repository.update(user);
  }

  async consumePasswordReset(userId: string, passwordHash: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.passwordChangeRequired = false;
    user.failedLoginCount = 0;
    delete user.lastFailedLoginAt;
    delete user.passwordResetTokenHash;
    delete user.passwordResetTokenExpiresAt;
    if (user.status === "locked") {
      user.status = "active";
      delete user.lockedAt;
      delete user.lockedReason;
    }
    return this.repository.update(user);
  }

  async findByPasswordResetTokenHash(tokenHash: string, now = new Date()): Promise<UserAccount | undefined> {
    return (await this.repository.list()).find((user) =>
      user.status !== "deleted" &&
      user.passwordResetTokenHash === tokenHash &&
      !!user.passwordResetTokenExpiresAt &&
      user.passwordResetTokenExpiresAt > now
    );
  }

  async activateWithPassword(userId: string, passwordHash: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.passwordChangeRequired = false;
    user.status = "active";
    delete user.passwordResetTokenHash;
    delete user.passwordResetTokenExpiresAt;
    return this.repository.update(user);
  }

  async recordSuccessfulLogin(userId: string, lastLoginIpHash?: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.failedLoginCount = 0;
    delete user.lastFailedLoginAt;
    user.lastLoginAt = new Date();
    if (lastLoginIpHash) user.lastLoginIpHash = lastLoginIpHash;
    return this.repository.update(user);
  }

  async setMfaEnrollment(userId: string, encryptedSecret: string, backupCodeHashes: string[]): Promise<UserAccount> {
    const user = await this.require(userId);
    user.mfaSecretEncrypted = encryptedSecret;
    user.mfaSecretIssuedAt = new Date();
    user.mfaBackupCodesHashes = backupCodeHashes;
    user.mfaStatus = "enrolled";
    return this.repository.update(user);
  }

  async markMfaVerified(userId: string, backupCodeHashes?: string[]): Promise<UserAccount> {
    const user = await this.require(userId);
    user.mfaStatus = "verified";
    if (backupCodeHashes) user.mfaBackupCodesHashes = backupCodeHashes;
    return this.repository.update(user);
  }

  async incrementFailedLogin(userId: string, now = new Date()): Promise<UserAccount> {
    const user = await this.require(userId);
    user.failedLoginCount += 1;
    user.lastFailedLoginAt = now;
    return this.repository.update(user);
  }

  async lock(userId: string, reason: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "locked";
    user.lockedAt = new Date();
    user.lockedReason = reason;
    return this.repository.update(user);
  }

  async suspend(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "suspended";
    return this.repository.update(user);
  }

  async unsuspend(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "active";
    return this.repository.update(user);
  }

  async unlock(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "active";
    delete user.lockedAt;
    delete user.lockedReason;
    user.failedLoginCount = 0;
    return this.repository.update(user);
  }

  async softDelete(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "deleted";
    user.deletedAt = new Date();
    user.email = `${user.id}@deleted.assurmatch.local`;
    return this.repository.update(user);
  }

  async resetMfa(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    delete user.mfaSecretEncrypted;
    delete user.mfaSecretIssuedAt;
    user.mfaBackupCodesHashes = [];
    user.mfaStatus = "required";
    return this.repository.update(user);
  }

  async require(id: string): Promise<UserAccount> {
    const user = await this.repository.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }
}

export class UsersModule {
  readonly service: UsersService;

  constructor(audit = new AuditLogWriter(), repository?: UsersRepository) {
    this.service = new UsersService(audit, repository);
  }
}
