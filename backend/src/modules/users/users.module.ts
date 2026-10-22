import { userCreateSchema, type UserCreateDto } from "../../../../packages/shared/contracts/auth.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryUsersRepository, type UserAccount, type UsersRepository } from "./users.repository";
import type { TrustedDeviceRevoker } from "../auth/trusted-device.service";

export type { UserAccount } from "./users.repository";

/** Statuses after which a still-trusted browser must not skip the second factor (spec 063 FR-A06). */
const ACCESS_ENDING_STATUSES = new Set<UserAccount["status"]>(["suspended", "locked", "deleted"]);

export class UsersService {
  /** Spec 063: ends the trusted devices of a user whose credentials or access change. */
  private trustedDevices?: TrustedDeviceRevoker | undefined;

  constructor(private readonly audit: AuditLogWriter, private readonly repository: UsersRepository = new MemoryUsersRepository()) {}

  setTrustedDeviceRevoker(revoker: TrustedDeviceRevoker | undefined): void {
    this.trustedDevices = revoker;
  }

  private async revokeTrustedDevices(userId: string, reason: Parameters<TrustedDeviceRevoker["revokeAll"]>[1]): Promise<void> {
    await this.trustedDevices?.revokeAll(userId, reason);
  }

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

  /**
   * Generic write. Spec 063: a change of password, MFA secret or of an access-ending status made
   * through this door (not through the dedicated methods below) also ends the trusted devices.
   */
  async update(user: UserAccount): Promise<UserAccount> {
    const before = await this.repository.findById(user.id);
    const updated = await this.repository.update(user);
    if (before) {
      const statusEnded = ACCESS_ENDING_STATUSES.has(updated.status) && updated.status !== before.status;
      if (statusEnded) await this.revokeTrustedDevices(updated.id, updated.status === "suspended" ? "suspended" : updated.status === "locked" ? "locked" : "deleted");
      else if (before.passwordHash !== updated.passwordHash) await this.revokeTrustedDevices(updated.id, "password_change");
      else if (before.mfaSecretEncrypted !== updated.mfaSecretEncrypted) await this.revokeTrustedDevices(updated.id, updated.mfaSecretEncrypted ? "mfa_reenrolled" : "mfa_reset");
    }
    return updated;
  }

  async setPassword(userId: string, passwordHash: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.passwordChangeRequired = false;
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "password_change");
    return updated;
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
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "password_reset");
    return updated;
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
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "password_reset");
    return updated;
  }

  /**
   * `resetFailedLogins: false` is used when the password is proven but a second factor is still
   * pending (spec 063): the counter is then cleared only once the login is complete, so the password
   * cannot be used to reset the lockout between wrong MFA codes.
   */
  async recordSuccessfulLogin(userId: string, lastLoginIpHash?: string, options: { resetFailedLogins?: boolean } = {}): Promise<UserAccount> {
    const user = await this.require(userId);
    if (options.resetFailedLogins !== false) {
      user.failedLoginCount = 0;
      delete user.lastFailedLoginAt;
    }
    user.lastLoginAt = new Date();
    if (lastLoginIpHash) user.lastLoginIpHash = lastLoginIpHash;
    return this.repository.update(user);
  }

  async setMfaEnrollment(userId: string, encryptedSecret: string, backupCodeHashes: string[]): Promise<UserAccount> {
    const user = await this.require(userId);
    const reenrolled = Boolean(user.mfaSecretEncrypted);
    user.mfaSecretEncrypted = encryptedSecret;
    user.mfaSecretIssuedAt = new Date();
    user.mfaBackupCodesHashes = backupCodeHashes;
    user.mfaStatus = "enrolled";
    const updated = await this.repository.update(user);
    if (reenrolled) await this.revokeTrustedDevices(userId, "mfa_reenrolled");
    return updated;
  }

  async markMfaVerified(userId: string, backupCodeHashes?: string[]): Promise<UserAccount> {
    const user = await this.require(userId);
    user.mfaStatus = "verified";
    // A valid second factor completes the login: the failed-attempt counter ends here.
    user.failedLoginCount = 0;
    delete user.lastFailedLoginAt;
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
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "locked");
    return updated;
  }

  /** `revocationReason` is "deactivated" when the owner of a broker firm deactivates a team member. */
  async suspend(userId: string, revocationReason: "suspended" | "deactivated" = "suspended"): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "suspended";
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, revocationReason);
    return updated;
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
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "deleted");
    return updated;
  }

  async resetMfa(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    delete user.mfaSecretEncrypted;
    delete user.mfaSecretIssuedAt;
    user.mfaBackupCodesHashes = [];
    user.mfaStatus = "required";
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "mfa_reset");
    return updated;
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
