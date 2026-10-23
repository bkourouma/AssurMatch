import { loginRequestSchema, type LoginRequest } from "../../../../packages/shared/contracts/auth.contracts";
import { activateRequestSchema, passwordChangeRequestSchema, passwordResetRequestSchema, type ActivateRequest, type PasswordChangeRequest, type PasswordResetRequest } from "../../../../packages/shared/contracts/auth.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import type { ActorContext } from "../common/types";
import type { UserAccount, UsersService } from "../users/users.module";
import { EncryptionService } from "./encryption.service";
import { signActorToken } from "./http-auth-token.service";
import { MfaService } from "./mfa.service";
import { PasswordHashingService } from "./password-hashing.service";
import { PasswordPolicyService } from "./password-policy.service";
import { PasswordResetService } from "./password-reset.service";
import { UserAuthNotificationService, type AuthEmailDeliveryPort } from "../notifications/user-auth-notification.service";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { PartnerTenantStatusPort } from "../partners/partner-tenant-status.service";
import { TrustedDeviceService } from "./trusted-device.service";
import { MemoryTrustedDevicesRepository, type TrustedDevicesRepository } from "./trusted-devices.repository";

/**
 * Spec 063: what a client may learn about the account from a session response. Hashes, the MFA
 * secret, backup codes, reset tokens and the login IP hash never leave the server.
 */
export interface AuthSessionUser {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  roles: UserAccount["roles"];
  status: UserAccount["status"];
  mfaStatus: UserAccount["mfaStatus"];
  partnerTenantId?: string;
  partnerPlan?: UserAccount["partnerPlan"];
  countryScopes: string[];
  productScopes: string[];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export function toAuthSessionUser(user: UserAccount): AuthSessionUser {
  return {
    id: user.id,
    email: user.email,
    ...(user.phone ? { phone: user.phone } : {}),
    displayName: user.displayName,
    roles: user.roles,
    status: user.status,
    mfaStatus: user.mfaStatus,
    ...(user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {}),
    ...(user.partnerPlan ? { partnerPlan: user.partnerPlan } : {}),
    countryScopes: user.countryScopes,
    productScopes: user.productScopes,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {})
  };
}

export interface AuthSession {
  accessToken: string;
  mfaRequired: boolean;
  user: AuthSessionUser;
  /** Spec 063: login only. A valid trusted-device token replaced the second factor. */
  trustedDeviceUsed?: boolean;
  /** Spec 063: login only. A token was presented and refused (the cause is never revealed). */
  trustedDeviceRejected?: boolean;
  /** Spec 063: verifyMfa only. Returned once, when the user asked to trust the device. */
  trustedDevice?: { token: string; expiresAt: string };
}

export interface VerifyMfaOptions {
  trustDevice?: boolean;
  deviceLabel?: string | undefined;
}

export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly mfa: MfaService,
    private readonly audit = new AuditLogWriter(),
    private readonly passwordHashing = new PasswordHashingService(),
    private readonly passwordReset = new PasswordResetService(),
    /** Spec 051 R12: the login of a user of a retired partner is refused. */
    private readonly tenantStatus?: PartnerTenantStatusPort,
    /** Spec 063: trusted devices (the 30-day exemption from the second factor). */
    private readonly trustedDevices: TrustedDeviceService = new TrustedDeviceService(new MemoryTrustedDevicesRepository(), audit)
  ) {}

  async login(input: LoginRequest): Promise<AuthSession> {
    const parsed = loginRequestSchema.parse(input);
    const user = await this.users.findByEmail(parsed.email);
    if (!user) {
      await this.passwordHashing.verifyBogus(parsed.password);
      await this.audit.writeAsync({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: "unknown", result: "refused", context: { email: parsed.email } });
      throw new Error("Invalid credentials");
    }
    if (user.status === "suspended") {
      await this.audit.writeAsync({ action: AuthAuditActions.userLoginRefusedSuspended, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email } });
      throw new Error("Account suspended");
    }
    if (user.status === "locked" || user.status === "deleted") {
      await this.audit.writeAsync({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, status: user.status } });
      throw new Error("Invalid credentials");
    }
    if (!await this.passwordHashing.verify(user.passwordHash, parsed.password)) {
      const failed = await this.users.incrementFailedLogin(user.id);
      await this.audit.writeAsync({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, failedLoginCount: failed.failedLoginCount } });
      if (failed.failedLoginCount >= this.lockoutThreshold()) {
        await this.users.lock(user.id, "failed-login-threshold");
        await this.audit.writeAsync({ action: AuthAuditActions.userLockedAfterFailedLogins, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
      }
      throw new Error("Invalid credentials");
    }
    // Spec 051 FR-022: checked only once the password is proven, with a neutral message, so the
    // response tells nothing about the partner to someone who does not hold the credentials.
    if (user.partnerTenantId && this.tenantStatus && await this.tenantStatus.status(user.partnerTenantId) === "retired") {
      await this.audit.writeAsync({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: user.id, result: "refused", reason: "partner_retired", context: { email: user.email, partnerTenantId: user.partnerTenantId } });
      throw new UnauthorizedException({ code: ErrorCodes.AUTH_REQUIRED, message: "Account unavailable" });
    }
    // Spec 063 FR-A01 / FR-A05: the password alone never proves the second factor. Only a valid
    // trusted-device token of this very user (on an active account that has an MFA secret) does.
    let trustedDeviceUsed = false;
    let trustedDeviceRejected = false;
    if (parsed.trustedDeviceToken) {
      if (user.status === "active" && user.mfaSecretEncrypted) {
        trustedDeviceUsed = (await this.trustedDevices.consume(user.id, parsed.trustedDeviceToken)).status === "valid";
      } else {
        await this.audit.writeAsync({ action: AuthAuditActions.userTrustedDeviceRejected, targetType: "User", targetId: user.id, result: "refused", reason: "ineligible_account", context: { cause: "ineligible_account" } });
      }
      trustedDeviceRejected = !trustedDeviceUsed;
    }
    // The failed-attempt counter is cleared only when the login is complete (device trusted); with a
    // second factor pending, the password alone must not reset the lockout.
    const activeUser = await this.users.recordSuccessfulLogin(user.id, undefined, { resetFailedLogins: trustedDeviceUsed });
    await this.audit.writeAsync({ action: AuthAuditActions.userLoginSucceeded, targetType: "User", targetId: user.id, result: "success", context: { email: user.email, mfaRequired: !trustedDeviceUsed, trustedDevice: trustedDeviceUsed } });
    return {
      accessToken: this.sign(activeUser, trustedDeviceUsed),
      mfaRequired: !trustedDeviceUsed,
      user: toAuthSessionUser(activeUser),
      ...(trustedDeviceUsed ? { trustedDeviceUsed: true } : {}),
      ...(trustedDeviceRejected ? { trustedDeviceRejected: true } : {})
    };
  }

  logout(): void {
    return undefined;
  }

  me(actor: ActorContext): ActorContext {
    return actor;
  }

  async activate(input: ActivateRequest): Promise<AuthSession> {
    const parsed = activateRequestSchema.parse(input);
    const tokenHash = this.passwordReset.hashToken(parsed.token);
    const user = await this.users.findByPasswordResetTokenHash(tokenHash);
    if (!user) {
      await this.audit.writeAsync({ action: AuthAuditActions.userPasswordResetInvalid, targetType: "User", targetId: "unknown", result: "refused", context: {} });
      throw new Error("Invalid activation token");
    }
    const passwordHash = await this.passwordReset.hashNewPassword(parsed.password, user);
    const activated = await this.users.activateWithPassword(user.id, passwordHash);
    await this.audit.writeAsync({ action: AuthAuditActions.userActivated, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    await this.audit.writeAsync({ action: AuthAuditActions.userPasswordChanged, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    return {
      accessToken: this.sign(activated, false),
      mfaRequired: true,
      user: toAuthSessionUser(activated)
    };
  }

  async changePassword(actor: ActorContext, input: PasswordChangeRequest): Promise<void> {
    const parsed = passwordChangeRequestSchema.parse(input);
    const user = await this.users.require(actor.actorId ?? "");
    if (!await this.passwordHashing.verify(user.passwordHash, parsed.oldPassword)) {
      await this.audit.writeAsync({ actor, action: AuthAuditActions.userPasswordChangeFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email } });
      throw new Error("Invalid password");
    }
    let passwordHash: string;
    try {
      passwordHash = await this.passwordReset.hashNewPassword(parsed.newPassword, user);
    } catch (error) {
      await this.audit.writeAsync({ actor, action: AuthAuditActions.userPasswordChangeFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, reason: "policy" } });
      throw error;
    }
    await this.users.setPassword(user.id, passwordHash);
    await this.audit.writeAsync({ actor, action: AuthAuditActions.userPasswordChanged, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
  }

  async resetPassword(input: PasswordResetRequest): Promise<void> {
    const parsed = passwordResetRequestSchema.parse(input);
    const tokenHash = this.passwordReset.hashToken(parsed.token);
    const user = await this.users.findByPasswordResetTokenHash(tokenHash);
    if (!user || this.passwordReset.isExpired(user.passwordResetTokenExpiresAt)) {
      await this.audit.writeAsync({ action: AuthAuditActions.userPasswordResetInvalid, targetType: "User", targetId: user?.id ?? "unknown", result: "refused", context: {} });
      throw new Error("Invalid password reset token");
    }
    const passwordHash = await this.passwordReset.hashNewPassword(parsed.newPassword, user);
    await this.users.consumePasswordReset(user.id, passwordHash);
    await this.audit.writeAsync({ action: AuthAuditActions.userPasswordResetConsumed, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
  }

  /**
   * Spec 063 FR-A08: a password-only session can enrol a first secret, but never replace an existing
   * one (that was an MFA bypass). Replacing it requires an actor that already passed the second factor.
   */
  async enrollMfa(user: UserAccount, actor?: Pick<ActorContext, "mfaVerified">) {
    // A secret that was never confirmed by a valid code protects nothing yet: it can be regenerated (a user who
    // left the screen before the first code must not be locked out). A confirmed one cannot be replaced.
    if (user.mfaSecretEncrypted && user.mfaStatus === "verified" && actor?.mfaVerified !== true) {
      await this.audit.writeAsync({ action: AuthAuditActions.userMfaEnrolled, targetType: "User", targetId: user.id, result: "refused", reason: "mfa_required", context: { email: user.email } });
      throw new ForbiddenException({ code: ErrorCodes.MFA_REQUIRED, message: "MFA required" });
    }
    const challenge = await this.mfa.enroll(user);
    await this.users.setMfaEnrollment(user.id, challenge.encryptedSecret, challenge.backupCodeHashes);
    await this.audit.writeAsync({ action: AuthAuditActions.userMfaEnrolled, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    return {
      secret: challenge.secret,
      otpauthUri: challenge.otpauthUri,
      backupCodes: challenge.backupCodes
    };
  }

  async verifyMfa(user: UserAccount, _challengeId: string, code: string, kind: "totp" | "backup" = "totp", options: VerifyMfaOptions = {}): Promise<AuthSession> {
    const result = await this.mfa.verify(user, code, kind);
    if (!result.verified) {
      const failed = await this.users.incrementFailedLogin(user.id);
      await this.audit.writeAsync({ action: AuthAuditActions.userMfaFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, failedLoginCount: failed.failedLoginCount, kind } });
      if (failed.failedLoginCount >= this.lockoutThreshold()) {
        await this.users.lock(user.id, "failed-mfa-threshold");
        await this.audit.writeAsync({ action: AuthAuditActions.userLockedAfterFailedLogins, targetType: "User", targetId: user.id, result: "success", context: { email: user.email, source: "mfa" } });
      }
      throw new Error("Invalid MFA code");
    }
    const verifiedUser = await this.users.markMfaVerified(user.id, result.backupCodeHashes);
    await this.audit.writeAsync({ action: AuthAuditActions.userMfaVerified, targetType: "User", targetId: user.id, result: "success", context: { email: user.email, kind } });
    // Spec 063 FR-A02: the clear token leaves the server once, in this response.
    const device = options.trustDevice === true ? await this.trustedDevices.issue(user.id, options.deviceLabel) : undefined;
    return {
      accessToken: this.sign(verifiedUser, true),
      mfaRequired: false,
      user: toAuthSessionUser(verifiedUser),
      ...(device ? { trustedDevice: { token: device.token, expiresAt: device.expiresAt.toISOString() } } : {})
    };
  }

  /** Spec 063: devices the user currently trusts (active ones only). */
  listTrustedDevices(actor: ActorContext) {
    return this.trustedDevices.listActive(actor.actorId ?? "");
  }

  /** Spec 063 FR-A06: `DELETE /auth/trusted-devices`. */
  async revokeTrustedDevices(actor: ActorContext): Promise<{ revoked: number }> {
    return { revoked: await this.trustedDevices.revokeAll(actor.actorId ?? "", "user_request", actor) };
  }

  private sign(user: UserAccount, mfaVerified: boolean): string {
    return signActorToken({
      actorId: user.id,
      roles: user.roles,
      ...(user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {}),
      ...(user.partnerPlan ? { partnerPlan: user.partnerPlan } : {}),
      countryScopes: user.countryScopes,
      productScopes: user.productScopes,
      mfaVerified
    }, this.jwtTtlSeconds());
  }

  private jwtTtlSeconds(): number {
    return Number(process.env.AUTH_JWT_TTL_MINUTES ?? "15") * 60;
  }

  private lockoutThreshold(): number {
    return Number(process.env.AUTH_LOCKOUT_THRESHOLD ?? "5");
  }
}

export class AuthModule {
  readonly encryption = new EncryptionService();
  readonly passwordHashing = new PasswordHashingService();
  readonly passwordPolicy = new PasswordPolicyService();
  readonly passwordReset = new PasswordResetService(this.passwordHashing, this.passwordPolicy);
  readonly mfa = new MfaService(this.encryption, this.passwordHashing);
  readonly userNotifications: UserAuthNotificationService;
  readonly service: AuthService;

  readonly trustedDevices: TrustedDeviceService;

  constructor(users: UsersService, audit = new AuditLogWriter(), emailSender?: AuthEmailDeliveryPort, tenantStatus?: PartnerTenantStatusPort, trustedDevicesRepository: TrustedDevicesRepository = new MemoryTrustedDevicesRepository()) {
    this.userNotifications = new UserAuthNotificationService(emailSender);
    this.trustedDevices = new TrustedDeviceService(trustedDevicesRepository, audit);
    // Spec 063 FR-A06: every credential or access change on an account ends its trusted devices.
    users.setTrustedDeviceRevoker(this.trustedDevices);
    this.service = new AuthService(users, this.mfa, audit, this.passwordHashing, this.passwordReset, tenantStatus, this.trustedDevices);
  }
}
