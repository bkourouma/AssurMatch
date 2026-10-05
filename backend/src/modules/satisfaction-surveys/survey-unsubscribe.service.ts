import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { notificationUnsubscribeSchema } from "../../../../packages/shared/contracts/admin-alerts.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

/** Spec 061 FR-005: the only non-transactional message of the platform so far. */
export const SATISFACTION_SURVEY_PURPOSE = "satisfaction_survey";

const DEFAULT_TEST_SECRET = "assurmatch-unsubscribe-test-secret-not-used-in-production";

export class UnsubscribeTokenInvalidError extends Error {
  constructor() {
    super("Unsubscribe link not found");
    this.name = "UnsubscribeTokenInvalidError";
  }
}

export const UnsubscribeAuditActions = {
  recorded: "notification.unsubscribed",
  refused: "notification.unsubscribe_refused"
} as const;

/** The unsubscribe key: a dedicated secret, else one derived from the auth token secret. */
function unsubscribeKey(env: Record<string, string | undefined> = process.env): string {
  const dedicated = env.ASSURMATCH_UNSUBSCRIBE_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;
  const auth = env.ASSURMATCH_AUTH_TOKEN_SECRET;
  // Domain separation: an unsubscribe signature can never be replayed as an auth token signature.
  if (auth && auth.length >= 32) return createHmac("sha256", auth).update("assurmatch:unsubscribe:v1").digest("base64url");
  if (env.NODE_ENV === "test") return DEFAULT_TEST_SECRET;
  throw new Error("Unsubscribe secret is not configured");
}

/** SHA-256 of the normalised address: the only form in which the subject is stored. */
export function unsubscribeSubjectHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

interface TokenPayload {
  v: 1;
  p: string;
  s: string;
  l: "fr" | "en";
}

/**
 * Signed, stateless unsubscribe token: `base64url(payload).base64url(HMAC-SHA256)`. The payload
 * carries the purpose, the hashed address and the language, never the address itself, so a leaked
 * link reveals nothing and cannot be forged for another address.
 */
export class UnsubscribeTokenSigner {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  sign(email: string, purpose: string, locale: "fr" | "en"): string {
    const payload: TokenPayload = { v: 1, p: purpose, s: unsubscribeSubjectHash(email), l: locale };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.mac(body)}`;
  }

  verify(token: string): TokenPayload | undefined {
    const [body, signature] = token.split(".");
    if (!body || !signature) return undefined;
    const expected = Buffer.from(this.mac(body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
      if (payload.v !== 1 || typeof payload.p !== "string" || typeof payload.s !== "string" || !/^[0-9a-f]{64}$/.test(payload.s)) return undefined;
      return { v: 1, p: payload.p, s: payload.s, l: payload.l === "en" ? "en" : "fr" };
    } catch {
      return undefined;
    }
  }

  private mac(body: string): string {
    return createHmac("sha256", unsubscribeKey(this.env)).update(body).digest("base64url");
  }
}

export interface NotificationUnsubscribeRecord {
  id: string;
  subjectHash: string;
  purpose: string;
  locale: string;
  createdAt: Date;
}

export interface NotificationUnsubscribeRepository extends RuntimeRepository {
  exists(subjectHash: string, purpose: string): Promise<boolean>;
  /** Idempotent: a second unsubscribe of the same subject is a no-op. */
  record(record: NotificationUnsubscribeRecord): Promise<"created" | "existing">;
}

export class MemoryNotificationUnsubscribeRepository implements NotificationUnsubscribeRepository {
  readonly mode = "memory-test" as const;
  private readonly records: NotificationUnsubscribeRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "NotificationUnsubscribeRepository");
  }

  async exists(subjectHash: string, purpose: string): Promise<boolean> {
    return this.records.some((record) => record.subjectHash === subjectHash && record.purpose === purpose);
  }

  async record(record: NotificationUnsubscribeRecord): Promise<"created" | "existing"> {
    if (await this.exists(record.subjectHash, record.purpose)) return "existing";
    this.records.push(record);
    return "created";
  }
}

type Delegate = { findUnique(input: unknown): Promise<unknown | null>; create(input: unknown): Promise<unknown> };

export class PrismaNotificationUnsubscribeRepository implements NotificationUnsubscribeRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async exists(subjectHash: string, purpose: string): Promise<boolean> {
    return Boolean(await this.client().findUnique({ where: { subjectHash_purpose: { subjectHash, purpose } } }));
  }

  async record(record: NotificationUnsubscribeRecord): Promise<"created" | "existing"> {
    try {
      await this.client().create({ data: record });
      return "created";
    } catch (error) {
      if ((error as { code?: unknown }).code === "P2002") return "existing";
      throw error;
    }
  }

  private client(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { notificationUnsubscribe: Delegate }).notificationUnsubscribe;
  }
}

/**
 * Spec 061 FR-005: opt-out of the satisfaction survey from the e-mail link, without authentication.
 * A wrong or forged token is one neutral 404; a repeat is idempotent. Only the hashed address is
 * stored and audited.
 */
export class SurveyUnsubscribeService {
  constructor(
    private readonly repository: NotificationUnsubscribeRepository,
    private readonly audit: AuditLogWriter,
    private readonly signer = new UnsubscribeTokenSigner()
  ) {}

  linkToken(email: string, locale: "fr" | "en"): string {
    return this.signer.sign(email, SATISFACTION_SURVEY_PURPOSE, locale);
  }

  isUnsubscribed(email: string): Promise<boolean> {
    return this.repository.exists(unsubscribeSubjectHash(email), SATISFACTION_SURVEY_PURPOSE);
  }

  async unsubscribe(input: unknown): Promise<{ status: "unsubscribed"; locale: "fr" | "en" }> {
    const parsed = notificationUnsubscribeSchema.safeParse(input ?? {});
    const payload = parsed.success ? this.signer.verify(parsed.data.token) : undefined;
    if (!payload || payload.p !== SATISFACTION_SURVEY_PURPOSE) {
      this.audit.write({ action: UnsubscribeAuditActions.refused, targetType: "NotificationUnsubscribe", targetId: "token", result: "refused", reason: "unsubscribe_token_invalid", context: {} });
      throw new UnsubscribeTokenInvalidError();
    }
    const outcome = await this.repository.record({ id: crypto.randomUUID(), subjectHash: payload.s, purpose: payload.p, locale: payload.l, createdAt: new Date() });
    this.audit.write({
      action: UnsubscribeAuditActions.recorded,
      targetType: "NotificationUnsubscribe",
      targetId: payload.s.slice(0, 12),
      result: "success",
      context: { purpose: payload.p, repeat: outcome === "existing" }
    });
    return { status: "unsubscribed", locale: payload.l };
  }
}
