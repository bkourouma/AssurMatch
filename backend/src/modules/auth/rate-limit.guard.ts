import { HttpException, HttpStatus } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { RedisClientPort } from "../common/redis/redis.module";
import { httpMetrics } from "../observability/http-metrics";

export interface AuthRateLimitKeyInput {
  ip?: string | undefined;
  /** Login e-mail, reset token or MFA user id: normalised, then hashed. */
  identifier?: string | undefined;
  route: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Spec 058 FR-006: Redis keys of the authentication buckets. Neither the e-mail nor the IP address is
 * stored in clear: both are hashed, so a Redis dump does not become a list of accounts and visitors.
 */
export function authRateLimitKeys(input: AuthRateLimitKeyInput): { ip: string; identifier?: string } {
  const route = input.route.replace(/[^a-z0-9:_/-]/gi, "_");
  return {
    ip: `auth:rl:${route}:ip:${digest(input.ip ?? "unknown")}`,
    ...(input.identifier ? { identifier: `auth:rl:${route}:id:${digest(input.identifier.trim().toLowerCase())}` } : {})
  };
}

export interface AuthRateLimitConfig {
  windowSeconds: number;
  /** Attempts (successful or not) per client IP and route within the window. */
  ipMax: number;
  /** Failed attempts per identifier and route within the window. */
  identifierMax: number;
}

function intEnv(env: Record<string, string | undefined>, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function authRateLimitConfig(env: Record<string, string | undefined> = process.env): AuthRateLimitConfig {
  return {
    windowSeconds: intEnv(env, "ASSURMATCH_AUTH_RATE_LIMIT_WINDOW_SECONDS", 900, 10, 86_400),
    ipMax: intEnv(env, "ASSURMATCH_AUTH_RATE_LIMIT_IP_MAX", 100, 1, 100_000),
    identifierMax: intEnv(env, "ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX", 10, 1, 10_000)
  };
}

/** The same neutral refusal for every route, whether the account exists or not. */
export function authRateLimitedError(): HttpException {
  return new HttpException({ code: ErrorCodes.RATE_LIMITED, message: "Too many attempts. Please try again later." }, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * Spec 058 FR-006: rate limiting of `POST /auth/login`, `/auth/password-reset` and `/auth/mfa/verify`.
 *
 * - IP bucket: every attempt counts; checked first.
 * - Identifier bucket: failures only, cleared by a success. It is checked BEFORE the attempt runs,
 *   so a blocked identifier gets the same 429 whether or not an account exists behind it.
 * The existing account lockout (failed-login threshold) stays in place on top of this.
 */
export class AuthRateLimiter {
  constructor(private readonly redis: RedisClientPort, private readonly config: AuthRateLimitConfig = authRateLimitConfig()) {}

  async run<T>(input: AuthRateLimitKeyInput, attempt: () => Promise<T>): Promise<T> {
    const keys = authRateLimitKeys(input);
    const ipCount = await this.redis.incr(keys.ip, this.config.windowSeconds);
    if (ipCount > this.config.ipMax) return this.refuse(input.route);
    if (keys.identifier) {
      const failures = Number.parseInt((await this.redis.get(keys.identifier)) ?? "0", 10);
      if (failures >= this.config.identifierMax) return this.refuse(input.route);
    }
    try {
      const result = await attempt();
      if (keys.identifier) await this.redis.del(keys.identifier);
      return result;
    } catch (error) {
      if (keys.identifier) await this.redis.incr(keys.identifier, this.config.windowSeconds);
      throw error;
    }
  }

  private refuse(route: string): never {
    httpMetrics.recordRateLimited(route);
    throw authRateLimitedError();
  }
}
