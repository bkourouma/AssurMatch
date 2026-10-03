import { createHash, randomBytes } from "node:crypto";
import { PasswordHashingService } from "./password-hashing.service";
import { PasswordPolicyService, type PasswordPolicySubject } from "./password-policy.service";

export interface IssuedPasswordToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export const DEFAULT_ACTION_TOKEN_TTL_MINUTES = 30;
const MIN_ACTION_TOKEN_TTL_MINUTES = 5;
const MAX_ACTION_TOKEN_TTL_MINUTES = 7 * 24 * 60;

/**
 * Validity of the activation and password-reset tokens, `AUTH_ACTION_TOKEN_TTL_MINUTES` (5 minutes
 * to 7 days, 30 by default). The e-mails announce the expiry computed from it (spec 059 follow-up).
 */
export function actionTokenTtlMinutes(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AUTH_ACTION_TOKEN_TTL_MINUTES?.trim();
  const value = raw ? Number(raw) : NaN;
  if (!Number.isInteger(value)) return DEFAULT_ACTION_TOKEN_TTL_MINUTES;
  return Math.min(MAX_ACTION_TOKEN_TTL_MINUTES, Math.max(MIN_ACTION_TOKEN_TTL_MINUTES, value));
}

export class PasswordResetService {
  private readonly tokenTtlMs: number;

  constructor(
    private readonly hashing = new PasswordHashingService(),
    private readonly policy = new PasswordPolicyService(),
    ttlMinutes: number = actionTokenTtlMinutes()
  ) {
    this.tokenTtlMs = ttlMinutes * 60 * 1000;
  }

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
