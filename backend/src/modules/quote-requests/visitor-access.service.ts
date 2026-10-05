import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { VisitorTrackingAuditActions } from "../audit-logs/visitor-tracking-audit-actions";
import type { ActorContext } from "../common/types";
import type { VisitorAccessTokenRecord, VisitorAccessTokensRepository } from "./visitor-access-tokens.repository";

/** Spec 054 R1 defaults; both are overridable by configuration. */
export const DEFAULT_VISITOR_TOKEN_TTL_DAYS = 30;
export const LEGACY_VISITOR_TOKEN_GRACE_DAYS = 90;
/** At most one `lastUsedAt` write per token and per minute. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SYSTEM_ACTOR: ActorContext = { actorId: "system:visitor-access", roles: [] };

/**
 * Stored in `QuoteRequest.verificationTokenHash` for every request created after spec 054. It is not
 * a SHA-256 hex digest, so the legacy comparison can never match it: new requests are reachable only
 * through `VisitorAccessToken` rows, which expire and can be revoked.
 */
export const VISITOR_ACCESS_TOKEN_MARKER = "visitor_access_token:v1";

export interface VisitorAccessQuote {
  id: string;
  publicReference: string;
  verificationTokenHash: string;
  createdAt: Date | string;
  anonymizedAt?: Date | string | null | undefined;
}

export interface VisitorAccessGrant<Q extends VisitorAccessQuote> {
  quote: Q;
  /** Expiry of the token that was presented (the cutover date for a legacy token). */
  expiresAt: Date;
  legacy: boolean;
}

export interface VisitorAccessOptions {
  ttlDays?: number;
  /** Absolute cutover for the tokens issued before spec 054; default: request creation + 90 days. */
  legacyUntil?: Date;
  now?: () => Date;
}

export type VisitorAccessDenialReason =
  | "token_missing"
  | "unknown_reference"
  | "quote_anonymized"
  | "token_invalid"
  | "token_expired"
  | "token_revoked"
  | "legacy_token_expired";

export function hashVisitorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time equality of two SHA-256 hex digests; anything that is not one never matches. */
function sameDigest(candidateHex: string, storedHex: string | undefined | null): boolean {
  if (!storedHex || !/^[0-9a-f]{64}$/i.test(storedHex)) return false;
  const left = Buffer.from(candidateHex, "hex");
  const right = Buffer.from(storedHex, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function resolveTtlDays(override: number | undefined): number {
  if (override !== undefined) return override;
  const raw = Number(process.env.ASSURMATCH_VISITOR_TOKEN_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VISITOR_TOKEN_TTL_DAYS;
}

function resolveLegacyUntil(override: Date | undefined): Date | undefined {
  if (override) return override;
  const raw = process.env.ASSURMATCH_LEGACY_VISITOR_TOKEN_UNTIL;
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Spec 054 R1: visitor access tokens. A token is 32 random bytes (base64url), shown once and stored
 * only as its SHA-256; verification compares digests in constant time, honours expiry and
 * revocation, and accepts the pre-054 `verificationTokenHash` until its cutover date. Every refusal
 * is audited without the token, the hash or any personal data.
 */
export class VisitorAccessService<Q extends VisitorAccessQuote = VisitorAccessQuote> {
  constructor(
    private readonly repository: VisitorAccessTokensRepository,
    private readonly audit: AuditLogWriter,
    private readonly findByPublicReference: (publicReference: string) => Promise<Q | undefined>,
    private readonly options: VisitorAccessOptions = {}
  ) {}

  /** Issues a new token for the request; the clear token is returned once and never stored. */
  async issue(quoteRequestId: string, context: { reason: string; actor?: ActorContext }): Promise<{ token: string; expiresAt: Date }> {
    const now = this.now();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + resolveTtlDays(this.options.ttlDays) * DAY_MS);
    const record: VisitorAccessTokenRecord = {
      id: crypto.randomUUID(),
      quoteRequestId,
      tokenHash: hashVisitorToken(token),
      purpose: "tracking",
      issuedAt: now,
      expiresAt,
      createdAt: now
    };
    await this.repository.create(record);
    this.audit.write({
      actor: context.actor ?? SYSTEM_ACTOR,
      action: VisitorTrackingAuditActions.tokenIssued,
      targetType: "QuoteRequest",
      targetId: quoteRequestId,
      result: "success",
      reason: context.reason,
      context: { tokenId: record.id, expiresAt: expiresAt.toISOString() }
    });
    return { token, expiresAt };
  }

  /**
   * Returns the request when `token` opens it, `undefined` otherwise. The caller answers every
   * `undefined` with the same neutral refusal, whatever the reason recorded in the audit trail.
   */
  async verify(publicReference: string, token: string | undefined, actor: ActorContext = SYSTEM_ACTOR): Promise<VisitorAccessGrant<Q> | undefined> {
    if (!token) return this.deny(actor, undefined, "token_missing");
    const quote = await this.findByPublicReference(publicReference);
    if (!quote) return this.deny(actor, undefined, "unknown_reference");
    if (quote.anonymizedAt) return this.deny(actor, quote.id, "quote_anonymized");
    const now = this.now();
    const candidate = hashVisitorToken(token);

    let matched: VisitorAccessTokenRecord | undefined;
    for (const record of await this.repository.listForQuote(quote.id)) {
      // Every stored digest is compared, so the time taken does not depend on which one matches.
      if (sameDigest(candidate, record.tokenHash)) matched = record;
    }
    if (matched) {
      if (matched.revokedAt) return this.deny(actor, quote.id, "token_revoked");
      if (asDate(matched.expiresAt).getTime() <= now.getTime()) return this.deny(actor, quote.id, "token_expired");
      await this.touch(matched, now);
      return { quote, expiresAt: asDate(matched.expiresAt), legacy: false };
    }

    if (sameDigest(candidate, quote.verificationTokenHash)) {
      const legacyUntil = resolveLegacyUntil(this.options.legacyUntil) ?? new Date(asDate(quote.createdAt).getTime() + LEGACY_VISITOR_TOKEN_GRACE_DAYS * DAY_MS);
      if (legacyUntil.getTime() <= now.getTime()) return this.deny(actor, quote.id, "legacy_token_expired");
      return { quote, expiresAt: legacyUntil, legacy: true };
    }
    return this.deny(actor, quote.id, "token_invalid");
  }

  async revokeAll(quoteRequestId: string, actor: ActorContext, reason: string): Promise<number> {
    const count = await this.repository.revokeAllForQuote(quoteRequestId, this.now());
    this.audit.write({
      actor,
      action: VisitorTrackingAuditActions.tokenRevoked,
      targetType: "QuoteRequest",
      targetId: quoteRequestId,
      result: "success",
      reason,
      context: { revoked: count }
    });
    return count;
  }

  private async touch(record: VisitorAccessTokenRecord, now: Date): Promise<void> {
    const last = record.lastUsedAt ? asDate(record.lastUsedAt).getTime() : 0;
    if (now.getTime() - last < LAST_USED_WRITE_INTERVAL_MS) return;
    await this.repository.update(record.id, { lastUsedAt: now }).catch(() => undefined);
  }

  private deny(actor: ActorContext, quoteRequestId: string | undefined, reason: VisitorAccessDenialReason): undefined {
    this.audit.write({
      actor,
      action: VisitorTrackingAuditActions.accessDenied,
      targetType: "QuoteRequest",
      targetId: quoteRequestId ?? "unknown",
      result: "refused",
      reason,
      context: {}
    });
    return undefined;
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
}
