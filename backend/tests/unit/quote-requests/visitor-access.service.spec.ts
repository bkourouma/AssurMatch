import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { VisitorTrackingAuditActions } from "../../../src/modules/audit-logs/visitor-tracking-audit-actions";
import { hashVisitorToken, VISITOR_ACCESS_TOKEN_MARKER, VisitorAccessService, type VisitorAccessQuote } from "../../../src/modules/quote-requests/visitor-access.service";
import { MemoryVisitorAccessTokensRepository } from "../../../src/modules/quote-requests/visitor-access-tokens.repository";

const DAY = 24 * 60 * 60 * 1000;

function world(options: { createdAt?: Date; legacyToken?: string; anonymized?: boolean; ttlDays?: number; legacyUntil?: Date } = {}) {
  let now = new Date("2026-10-03T10:00:00.000Z");
  const quote: VisitorAccessQuote = {
    id: "quote-1",
    publicReference: "QR-2026-ABCDEF12",
    verificationTokenHash: options.legacyToken ? createHash("sha256").update(options.legacyToken).digest("hex") : VISITOR_ACCESS_TOKEN_MARKER,
    createdAt: options.createdAt ?? now,
    ...(options.anonymized ? { anonymizedAt: now } : {})
  };
  const repository = new MemoryVisitorAccessTokensRepository();
  const audit = new AuditLogWriter();
  const service = new VisitorAccessService(repository, audit, async (reference) => (reference === quote.publicReference ? quote : undefined), {
    now: () => now,
    ...(options.ttlDays ? { ttlDays: options.ttlDays } : {}),
    ...(options.legacyUntil ? { legacyUntil: options.legacyUntil } : {})
  });
  return {
    quote,
    repository,
    audit,
    service,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    denials: () => audit.all().filter((entry) => entry.action === VisitorTrackingAuditActions.accessDenied).map((entry) => entry.reason)
  };
}

describe("VisitorAccessService (spec 054 R1)", () => {
  afterEach(() => {
    delete process.env.ASSURMATCH_VISITOR_TOKEN_TTL_DAYS;
    delete process.env.ASSURMATCH_LEGACY_VISITOR_TOKEN_UNTIL;
  });

  it("issues a random 32-byte token valid 30 days and stores only its hash", async () => {
    const { service, repository, quote } = world();
    const issued = await service.issue(quote.id, { reason: "submission" });

    expect(Buffer.from(issued.token, "base64url")).toHaveLength(32);
    const [stored] = await repository.listForQuote(quote.id);
    expect(stored?.tokenHash).toBe(hashVisitorToken(issued.token));
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    expect(issued.expiresAt.getTime() - stored!.issuedAt.getTime()).toBe(30 * DAY);

    const grant = await service.verify(quote.publicReference, issued.token);
    expect(grant?.quote.id).toBe(quote.id);
    expect(grant?.legacy).toBe(false);
    expect(grant?.expiresAt.toISOString()).toBe(issued.expiresAt.toISOString());
  });

  it("keeps earlier tokens valid when a new one is issued", async () => {
    const { service, quote } = world();
    const first = await service.issue(quote.id, { reason: "submission" });
    const second = await service.issue(quote.id, { reason: "notification" });
    expect(first.token).not.toBe(second.token);
    expect(await service.verify(quote.publicReference, first.token)).toBeDefined();
    expect(await service.verify(quote.publicReference, second.token)).toBeDefined();
  });

  it("refuses a wrong, missing, expired or revoked token and an unknown reference, auditing each reason", async () => {
    const context = world();
    const { service, quote } = context;
    const issued = await service.issue(quote.id, { reason: "submission" });

    expect(await service.verify(quote.publicReference, "not-the-token")).toBeUndefined();
    expect(await service.verify(quote.publicReference, "")).toBeUndefined();
    expect(await service.verify("QR-2026-UNKNOWN0", issued.token)).toBeUndefined();

    context.advance(30 * DAY);
    expect(await service.verify(quote.publicReference, issued.token)).toBeUndefined();

    const fresh = await service.issue(quote.id, { reason: "resend" });
    await service.revokeAll(quote.id, { roles: [] }, "test");
    expect(await service.verify(quote.publicReference, fresh.token)).toBeUndefined();

    expect(context.denials()).toEqual(["token_invalid", "token_missing", "unknown_reference", "token_expired", "token_revoked"]);
    // The audit trail never carries the token or its hash.
    const trail = JSON.stringify(context.audit.all());
    expect(trail).not.toContain(issued.token);
    expect(trail).not.toContain(hashVisitorToken(issued.token));
  });

  it("honours the TTL override from the environment", async () => {
    process.env.ASSURMATCH_VISITOR_TOKEN_TTL_DAYS = "2";
    const context = world();
    const issued = await context.service.issue(context.quote.id, { reason: "submission" });
    context.advance(2 * DAY - 1000);
    expect(await context.service.verify(context.quote.publicReference, issued.token)).toBeDefined();
    context.advance(2000);
    expect(await context.service.verify(context.quote.publicReference, issued.token)).toBeUndefined();
  });

  it("accepts a pre-054 token until creation + 90 days, then refuses it", async () => {
    const context = world({ legacyToken: "legacy-uuid-token" });
    const grant = await context.service.verify(context.quote.publicReference, "legacy-uuid-token");
    expect(grant?.legacy).toBe(true);
    expect(grant?.expiresAt.toISOString()).toBe(new Date(new Date(context.quote.createdAt).getTime() + 90 * DAY).toISOString());

    context.advance(90 * DAY);
    expect(await context.service.verify(context.quote.publicReference, "legacy-uuid-token")).toBeUndefined();
    expect(context.denials()).toEqual(["legacy_token_expired"]);
  });

  it("uses the configured cutover date for pre-054 tokens", async () => {
    process.env.ASSURMATCH_LEGACY_VISITOR_TOKEN_UNTIL = "2026-10-04T00:00:00.000Z";
    const context = world({ legacyToken: "legacy-uuid-token" });
    expect(await context.service.verify(context.quote.publicReference, "legacy-uuid-token")).toBeDefined();
    context.advance(DAY);
    expect(await context.service.verify(context.quote.publicReference, "legacy-uuid-token")).toBeUndefined();
  });

  it("never lets the marker of a post-054 request act as a legacy token", async () => {
    const context = world();
    expect(await context.service.verify(context.quote.publicReference, VISITOR_ACCESS_TOKEN_MARKER)).toBeUndefined();
  });

  it("refuses every token once the request is anonymized", async () => {
    const context = world({ anonymized: true });
    const issued = await context.service.issue(context.quote.id, { reason: "submission" });
    expect(await context.service.verify(context.quote.publicReference, issued.token)).toBeUndefined();
    expect(context.denials()).toEqual(["quote_anonymized"]);
  });

  it("records the last use at most once per minute", async () => {
    const context = world();
    const issued = await context.service.issue(context.quote.id, { reason: "submission" });
    await context.service.verify(context.quote.publicReference, issued.token);
    const firstUse = (await context.repository.listForQuote(context.quote.id))[0]?.lastUsedAt;
    context.advance(30_000);
    await context.service.verify(context.quote.publicReference, issued.token);
    expect((await context.repository.listForQuote(context.quote.id))[0]?.lastUsedAt).toEqual(firstUse);
    context.advance(31_000);
    await context.service.verify(context.quote.publicReference, issued.token);
    expect((await context.repository.listForQuote(context.quote.id))[0]?.lastUsedAt).not.toEqual(firstUse);
  });
});
