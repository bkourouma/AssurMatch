import { QuoteRedisKeys } from "../redis/quote-redis-keys";
import type { RedisClientPort } from "../redis/redis.module";

export const PUBLIC_ABUSE_SCOPES = ["waitlist", "contact", "partner_application", "consent_withdrawal"] as const;

export type PublicAbuseScope = (typeof PUBLIC_ABUSE_SCOPES)[number];

export interface PublicAbuseGuardInput {
  scope: PublicAbuseScope;
  ipAddress: string;
  sessionId?: string;
  honeypot?: string;
  limitPerWindow: number;
  windowSeconds: number;
}

/** A session may post at most this many times in `SESSION_BURST_WINDOW_SECONDS`, all scopes apart. */
const SESSION_BURST_LIMIT = 10;
const SESSION_BURST_WINDOW_SECONDS = 300;

/**
 * Abuse control shared by every unauthenticated POST of the public site. Both refusals travel as
 * plain messages that `ErrorResponseFilter` maps: "Invalid submission" becomes 400 and
 * "Rate limit exceeded" becomes 429, so no caller has to know the HTTP layer.
 */
export class PublicAbuseGuardService {
  constructor(private readonly redis: RedisClientPort) {}

  async assertAllowed(input: PublicAbuseGuardInput): Promise<void> {
    if (typeof input.honeypot === "string" && input.honeypot.trim().length > 0) {
      throw new Error("Invalid submission: spam_blocked");
    }

    const ipCount = await this.redis.incr(
      QuoteRedisKeys.publicScopeRateLimit(input.scope, input.ipAddress),
      input.windowSeconds
    );
    if (ipCount > input.limitPerWindow) {
      throw new Error("Rate limit exceeded for public submissions");
    }

    if (input.sessionId) {
      const sessionCount = await this.redis.incr(
        QuoteRedisKeys.publicScopeSession(input.scope, input.sessionId),
        SESSION_BURST_WINDOW_SECONDS
      );
      if (sessionCount > SESSION_BURST_LIMIT) {
        throw new Error("Invalid submission: spam_blocked");
      }
    }
  }
}
