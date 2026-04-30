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

export interface AuthSession {
  accessToken: string;
  mfaRequired: boolean;
  user: UserAccount;
}

export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly mfa: MfaService,
    private readonly audit = new AuditLogWriter(),
    private readonly passwordHashing = new PasswordHashingService(),
    private readonly passwordReset = new PasswordResetService()
  ) {}

  async login(input: LoginRequest): Promise<AuthSession> {
    const parsed = loginRequestSchema.parse(input);
    const user = await this.users.findByEmail(parsed.email);
    if (!user) {
      await this.passwordHashing.verifyBogus(parsed.password);
      this.audit.write({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: "unknown", result: "refused", context: { email: parsed.email } });
      throw new Error("Invalid credentials");
    }
    if (user.status === "suspended") {
      this.audit.write({ action: AuthAuditActions.userLoginRefusedSuspended, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email } });
      throw new Error("Account suspended");
    }
    if (user.status === "locked" || user.status === "deleted") {
      this.audit.write({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, status: user.status } });
      throw new Error("Invalid credentials");
    }
    if (!await this.passwordHashing.verify(user.passwordHash, parsed.password)) {
      const failed = await this.users.incrementFailedLogin(user.id);
      this.audit.write({ action: AuthAuditActions.userLoginFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, failedLoginCount: failed.failedLoginCount } });
      if (failed.failedLoginCount >= this.lockoutThreshold()) {
        await this.users.lock(user.id, "failed-login-threshold");
        this.audit.write({ action: AuthAuditActions.userLockedAfterFailedLogins, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
      }
      throw new Error("Invalid credentials");
    }
    const activeUser = await this.users.recordSuccessfulLogin(user.id);
    this.audit.write({ action: AuthAuditActions.userLoginSucceeded, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    return {
      accessToken: this.sign(activeUser, activeUser.mfaStatus === "verified"),
      mfaRequired: activeUser.mfaStatus !== "verified",
      user: activeUser
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
      this.audit.write({ action: AuthAuditActions.userPasswordResetInvalid, targetType: "User", targetId: "unknown", result: "refused", context: {} });
      throw new Error("Invalid activation token");
    }
    const passwordHash = await this.passwordReset.hashNewPassword(parsed.password, user);
    const activated = await this.users.activateWithPassword(user.id, passwordHash);
    this.audit.write({ action: AuthAuditActions.userActivated, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    this.audit.write({ action: AuthAuditActions.userPasswordChanged, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    return {
      accessToken: this.sign(activated, false),
      mfaRequired: true,
      user: activated
    };
  }

  async changePassword(actor: ActorContext, input: PasswordChangeRequest): Promise<void> {
    const parsed = passwordChangeRequestSchema.parse(input);
    const user = await this.users.require(actor.actorId ?? "");
    if (!await this.passwordHashing.verify(user.passwordHash, parsed.oldPassword)) {
      this.audit.write({ actor, action: AuthAuditActions.userPasswordChangeFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email } });
      throw new Error("Invalid password");
    }
    let passwordHash: string;
    try {
      passwordHash = await this.passwordReset.hashNewPassword(parsed.newPassword, user);
    } catch (error) {
      this.audit.write({ actor, action: AuthAuditActions.userPasswordChangeFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, reason: "policy" } });
      throw error;
    }
    await this.users.setPassword(user.id, passwordHash);
    this.audit.write({ actor, action: AuthAuditActions.userPasswordChanged, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
  }

  async resetPassword(input: PasswordResetRequest): Promise<void> {
    const parsed = passwordResetRequestSchema.parse(input);
    const tokenHash = this.passwordReset.hashToken(parsed.token);
    const user = await this.users.findByPasswordResetTokenHash(tokenHash);
    if (!user || this.passwordReset.isExpired(user.passwordResetTokenExpiresAt)) {
      this.audit.write({ action: AuthAuditActions.userPasswordResetInvalid, targetType: "User", targetId: user?.id ?? "unknown", result: "refused", context: {} });
      throw new Error("Invalid password reset token");
    }
    const passwordHash = await this.passwordReset.hashNewPassword(parsed.newPassword, user);
    await this.users.consumePasswordReset(user.id, passwordHash);
    this.audit.write({ action: AuthAuditActions.userPasswordResetConsumed, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
  }

  async enrollMfa(user: UserAccount) {
    const challenge = await this.mfa.enroll(user);
    await this.users.setMfaEnrollment(user.id, challenge.encryptedSecret, challenge.backupCodeHashes);
    this.audit.write({ action: AuthAuditActions.userMfaEnrolled, targetType: "User", targetId: user.id, result: "success", context: { email: user.email } });
    return {
      secret: challenge.secret,
      otpauthUri: challenge.otpauthUri,
      backupCodes: challenge.backupCodes
    };
  }

  async verifyMfa(user: UserAccount, _challengeId: string, code: string, kind: "totp" | "backup" = "totp"): Promise<AuthSession> {
    const result = await this.mfa.verify(user, code, kind);
    if (!result.verified) {
      const failed = await this.users.incrementFailedLogin(user.id);
      this.audit.write({ action: AuthAuditActions.userMfaFailed, targetType: "User", targetId: user.id, result: "refused", context: { email: user.email, failedLoginCount: failed.failedLoginCount, kind } });
      if (failed.failedLoginCount >= this.lockoutThreshold()) {
        await this.users.lock(user.id, "failed-mfa-threshold");
        this.audit.write({ action: AuthAuditActions.userLockedAfterFailedLogins, targetType: "User", targetId: user.id, result: "success", context: { email: user.email, source: "mfa" } });
      }
      throw new Error("Invalid MFA code");
    }
    const verifiedUser = await this.users.markMfaVerified(user.id, result.backupCodeHashes);
    this.audit.write({ action: AuthAuditActions.userMfaVerified, targetType: "User", targetId: user.id, result: "success", context: { email: user.email, kind } });
    return {
      accessToken: this.sign(verifiedUser, true),
      mfaRequired: false,
      user: verifiedUser
    };
  }

  private sign(user: UserAccount, mfaVerified: boolean): string {
    return signActorToken({ actorId: user.id, roles: user.roles, ...(user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {}), mfaVerified }, this.jwtTtlSeconds());
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

  constructor(users: UsersService, audit = new AuditLogWriter(), emailSender?: AuthEmailDeliveryPort) {
    this.userNotifications = new UserAuthNotificationService(emailSender);
    this.service = new AuthService(users, this.mfa, audit, this.passwordHashing, this.passwordReset);
  }
}
