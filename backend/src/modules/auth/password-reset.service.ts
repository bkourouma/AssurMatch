import { createHash, randomBytes } from "node:crypto";
import { PasswordHashingService } from "./password-hashing.service";
import { PasswordPolicyService, type PasswordPolicySubject } from "./password-policy.service";

export interface IssuedPasswordToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export class PasswordResetService {
  private readonly tokenTtlMs = 30 * 60 * 1000;

  constructor(
    private readonly hashing = new PasswordHashingService(),
    private readonly policy = new PasswordPolicyService()
  ) {}

  issueToken(now = new Date()): IssuedPasswordToken {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(now.getTime() + this.tokenTtlMs)
    };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async hashNewPassword(password: string, subject: PasswordPolicySubject): Promise<string> {
    this.policy.assertAcceptable(password, subject);
    return this.hashing.hash(password);
  }

  isExpired(expiresAt: Date | undefined, now = new Date()): boolean {
    return !expiresAt || expiresAt <= now;
  }
}
