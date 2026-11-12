import { userCreateSchema, type UserCreateDto } from "../../../../packages/shared/contracts/auth.contracts";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryUsersRepository, UserNotFoundError, type UserAccount, type UsersRepository } from "./users.repository";
import type { TrustedDeviceRevoker } from "../auth/trusted-device.service";

export type { UserAccount } from "./users.repository";

/** Statuses after which a still-trusted browser must not skip the second factor (spec 063 FR-A06). */
/** Lock reasons written by the login / MFA lockout (auth.module.ts); every other reason is an admin lock. */
const AUTOMATIC_LOCK_REASONS: ReadonlySet<string> = new Set(["failed-login-threshold", "failed-mfa-threshold"]);
const ACCESS_ENDING_STATUSES = new Set<UserAccount["status"]>(["suspended", "locked", "deleted"]);

export class UsersService {
  /** Spec 063: ends the trusted devices of a user whose credentials or access change. */
  private trustedDevices?: TrustedDeviceRevoker | undefined;

  /** Listeners told right after any change of status, roles or credentials (immediate access-cache invalidation). */
  private readonly accessListeners: Array<(userId: string) => void> = [];

  constructor(private readonly audit: AuditLogWriter, private readonly repository: UsersRepository = new MemoryUsersRepository()) {}

  /** Subscribes to access changes (suspend, lock, delete, roles, activation, reset). Never throws into the caller. */
  onAccessChange(listener: (userId: string) => void): void {
    this.accessListeners.push(listener);
  }

  private notifyAccessChange(userId: string): void {
    for (const listener of this.accessListeners) {
      try {
        listener(userId);
      } catch {
        // an observer must never break the write that already succeeded
      }
    }
  }

  /** Atomic TOTP replay guard: true only if `counter` is strictly greater than the last accepted one. */
  async claimTotpCounter(userId: string, counter: number): Promise<boolean> {
    return this.repository.claimTotpCounter(userId, counter);
  }

  /** Atomic single-use backup code: true only for the one caller that blanked the entry holding `hash`. */
  async consumeBackupCode(userId: string, hash: string): Promise<boolean> {
    return this.repository.consumeBackupCode(userId, hash);
  }

  /**
   * SEC-LAST-1: refuses (409 LAST_SUPER_ADMIN) an action that would leave no active super_admin.
   * `stillSuperAdmin` is whether the target remains an active super_admin after the action.
   */
  private async assertNotLastSuperAdmin(target: UserAccount, stillSuperAdmin: boolean): Promise<void> {
    if (stillSuperAdmin) return;
    if (target.status !== "active" || !target.roles.includes("super_admin")) return;
    const others = (await this.repository.list()).filter((user) =>
      user.id !== target.id && user.status === "active" && !user.deletedAt && user.roles.includes("super_admin")
    );
    if (others.length === 0) {
      throw new ConflictException({ code: ErrorCodes.LAST_SUPER_ADMIN, message: "The last active super administrator cannot be removed" });
    }
  }

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
    await this.audit.writeAsync({
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
    await this.assertNotLastSuperAdmin(user, roles.includes("super_admin"));
    user.roles = roles;
    const updated = await this.repository.update(user);
    this.notifyAccessChange(userId);
    await this.audit.writeAsync({
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
      if (before.status !== updated.status || [...before.roles].sort().join(",") !== [...updated.roles].sort().join(",")) this.notifyAccessChange(updated.id);
    } else {
      this.notifyAccessChange(updated.id);
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
    // Only an AUTOMATIC lock (failed-login / failed-MFA threshold) is lifted by a proven password reset;
    // a lock set by an admin (any other reason) and a suspension are kept: the reset is not an unlock.
    if (user.status === "locked" && user.lockedReason !== undefined && AUTOMATIC_LOCK_REASONS.has(user.lockedReason)) {
      user.status = "active";
      delete user.lockedAt;
      delete user.lockedReason;
    }
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "password_reset");
    this.notifyAccessChange(userId);
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
    // Only an invited account is activated by its token: a locked, suspended, active or deleted account never is.
    if (user.status !== "invited") throw new ForbiddenException({ code: ErrorCodes.INVALID_TOKEN, message: "Invalid activation token" });
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.passwordChangeRequired = false;
    user.status = "active";
    delete user.passwordResetTokenHash;
    delete user.passwordResetTokenExpiresAt;
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "password_reset");
    this.notifyAccessChange(userId);
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
    delete user.mfaLastTotpCounter;
    user.mfaBackupCodesHashes = backupCodeHashes;
    user.mfaStatus = "enrolled";
    const updated = await this.repository.update(user);
    await this.repository.clearTotpCounter(userId);
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
    // An account without a password (a still-invited one) has nothing to guess: it is never counted nor
    // locked (a lock would make the activation link unusable and the unlock would skip the password).
    if (!user.passwordHash) return user;
    user.failedLoginCount += 1;
    user.lastFailedLoginAt = now;
    return this.repository.update(user);
  }

  async lock(userId: string, reason: string): Promise<UserAccount> {
    const user = await this.require(userId);
    await this.assertNotLastSuperAdmin(user, false);
    user.status = "locked";
    user.lockedAt = new Date();
    user.lockedReason = reason;
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "locked");
    this.notifyAccessChange(userId);
    return updated;
  }

  /** `revocationReason` is "deactivated" when the owner of a broker firm deactivates a team member. */
  async suspend(userId: string, revocationReason: "suspended" | "deactivated" = "suspended"): Promise<UserAccount> {
    const user = await this.require(userId);
    await this.assertNotLastSuperAdmin(user, false);
    user.status = "suspended";
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, revocationReason);
    this.notifyAccessChange(userId);
    return updated;
  }

  async unsuspend(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    user.status = "active";
    const updated = await this.repository.update(user);
    this.notifyAccessChange(userId);
    return updated;
  }

  async unlock(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    // An account that never got a password goes back to "invited" (its activation link), never "active".
    user.status = user.passwordHash ? "active" : "invited";
    delete user.lockedAt;
    delete user.lockedReason;
    user.failedLoginCount = 0;
    const updated = await this.repository.update(user);
    this.notifyAccessChange(userId);
    return updated;
  }

  async softDelete(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    await this.assertNotLastSuperAdmin(user, false);
    user.status = "deleted";
    user.deletedAt = new Date();
    user.email = `${user.id}@deleted.assurmatch.local`;
    const updated = await this.repository.update(user);
    await this.revokeTrustedDevices(userId, "deleted");
    this.notifyAccessChange(userId);
    return updated;
  }

  async resetMfa(userId: string): Promise<UserAccount> {
    const user = await this.require(userId);
    delete user.mfaSecretEncrypted;
    delete user.mfaSecretIssuedAt;
    delete user.mfaLastTotpCounter;
    user.mfaBackupCodesHashes = [];
    user.mfaStatus = "required";
    const updated = await this.repository.update(user);
    await this.repository.clearTotpCounter(userId);
    await this.revokeTrustedDevices(userId, "mfa_reset");
    return updated;
  }

  async require(id: string): Promise<UserAccount> {
    const user = await this.repository.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }
}

export class UsersModule {
  readonly service: UsersService;

  constructor(audit = new AuditLogWriter(), repository?: UsersRepository) {
    this.service = new UsersService(audit, repository);
  }
}
