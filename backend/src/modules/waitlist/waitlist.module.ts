import {
  waitlistSubscribeSchema,
  type WaitlistSubscribeResponse
} from "../../../../packages/shared/contracts/public-site.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { Country } from "../countries/countries.module";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import type { Product } from "../products/products.module";
import type { ProspectIdentityService } from "../prospects/prospect-identity.service";
import { MemoryWaitlistRepository, type WaitlistEntryRecord, type WaitlistRepository } from "./waitlist.repository";

/** Spec 045: five submissions per ten-minute window, shared with the other public-site scopes. */
const WAITLIST_RATE_LIMIT_PER_WINDOW = 5;
const WAITLIST_RATE_LIMIT_WINDOW_SECONDS = 600;
const WAITLIST_CONSENT_VERSION = "waitlist-v1";
const WAITLIST_RETENTION_YEARS = 3;

export interface WaitlistSubscribeContext {
  ipAddress: string;
  actor?: ActorContext;
}

export interface WaitlistServiceDependencies {
  findCountryByCode: (countryCode: string) => Country | undefined | Promise<Country | undefined>;
  findProductByKey: (productKey: string) => Product | undefined | Promise<Product | undefined>;
  identity: ProspectIdentityService;
  abuseGuard: PublicAbuseGuardService;
  retention: RetentionPolicyService;
  globalFlags?: () => Partial<Record<string, boolean>>;
}

export class WaitlistService {
  constructor(
    private readonly deps: WaitlistServiceDependencies,
    private readonly audit: AuditLogWriter,
    private readonly repository: WaitlistRepository = new MemoryWaitlistRepository()
  ) {}

  async subscribe(rawInput: unknown, context: WaitlistSubscribeContext): Promise<WaitlistSubscribeResponse> {
    // The abuse guard runs before validation so a spam/flood attempt is stopped even when the
    // rest of the payload is malformed; the honeypot and session id are read leniently, without
    // committing to the full schema yet.
    const candidate = typeof rawInput === "object" && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
    const honeypot = typeof candidate.website === "string" ? candidate.website : undefined;
    const sessionId = typeof candidate.sessionId === "string" ? candidate.sessionId : undefined;

    await this.deps.abuseGuard.assertAllowed({
      scope: "waitlist",
      ipAddress: context.ipAddress,
      ...(sessionId ? { sessionId } : {}),
      ...(honeypot ? { honeypot } : {}),
      limitPerWindow: WAITLIST_RATE_LIMIT_PER_WINDOW,
      windowSeconds: WAITLIST_RATE_LIMIT_WINDOW_SECONDS
    });

    const parsedResult = waitlistSubscribeSchema.safeParse(rawInput);
    if (!parsedResult.success) {
      throw new Error("Waitlist subscription validation failed");
    }
    const parsed = parsedResult.data;

    const country = await this.deps.findCountryByCode(parsed.countryCode);
    if (!country) {
      throw new Error("Country not found");
    }

    const globalFlags = this.deps.globalFlags ? this.deps.globalFlags() : {};
    const journeyState = new PublicJourneyFlagPolicy().resolve({ globalFlags, countryFlags: country.flags });
    if (journeyState.waitlistOnly !== true) {
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistRefused,
        targetType: "WaitlistEntry",
        targetId: "draft",
        scope: { countryId: country.id },
        result: "refused",
        reason: "waitlist_disabled",
        context: {}
      });
      throw new Error("Waitlist is disabled for this country");
    }

    let productId: string | undefined;
    if (parsed.productKey) {
      const product = await this.deps.findProductByKey(parsed.productKey);
      if (!product || !product.countryIds.includes(country.id)) {
        throw new Error("Waitlist product validation failed: product is not associated with this country");
      }
      productId = product.id;
    }

    const fingerprint = this.deps.identity.fingerprint(parsed.email);
    const existing = await this.repository.findByCountryAndFingerprint(country.id, fingerprint);
    if (existing) {
      // Never reveal to the caller that the address was already on the list: the response is the
      // same success payload as a first-time subscription.
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistDuplicateIgnored,
        targetType: "WaitlistEntry",
        targetId: existing.id,
        scope: { countryId: country.id, ...(productId ? { productId } : {}) },
        result: "success",
        context: { fingerprint }
      });
      return this.successResponse(parsed.countryCode);
    }

    const now = new Date();
    const entry: WaitlistEntryRecord = {
      id: crypto.randomUUID(),
      countryId: country.id,
      ...(productId ? { productId } : {}),
      emailNormalized: parsed.email,
      emailFingerprint: fingerprint,
      consentVersion: WAITLIST_CONSENT_VERSION,
      status: "active",
      ipHash: QuoteRedisKeys.ipHash(context.ipAddress),
      source: "public_web",
      retentionUntil: this.deps.retention.retentionUntil(now, WAITLIST_RETENTION_YEARS),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(entry);
    this.audit.write({
      actor: context.actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistSubscribed,
      targetType: "WaitlistEntry",
      targetId: entry.id,
      scope: { countryId: country.id, ...(productId ? { productId } : {}) },
      result: "success",
      context: { fingerprint }
    });
    return this.successResponse(parsed.countryCode);
  }

  private successResponse(countryCode: string): WaitlistSubscribeResponse {
    return {
      status: "accepted",
      countryCode,
      message:
        "Merci, votre adresse est enregistree: nous vous informerons par e-mail a l'ouverture d'AssurMatch dans ce pays, sans aucun engagement de votre part ni de la notre."
    };
  }
}

export interface WaitlistModuleDeps {
  findCountryByCode: (countryCode: string) => Country | undefined | Promise<Country | undefined>;
  findProductByKey: (productKey: string) => Product | undefined | Promise<Product | undefined>;
  identity: ProspectIdentityService;
  globalFlags?: () => Partial<Record<string, boolean>>;
}

export class WaitlistModule {
  readonly abuseGuard: PublicAbuseGuardService;
  readonly retention: RetentionPolicyService;
  readonly service: WaitlistService;

  constructor(
    deps: WaitlistModuleDeps,
    audit: AuditLogWriter = new AuditLogWriter(),
    redis: RedisClientPort = new InMemoryRedisClient(),
    repository?: WaitlistRepository
  ) {
    this.abuseGuard = new PublicAbuseGuardService(redis);
    this.retention = new RetentionPolicyService();
    this.service = new WaitlistService(
      {
        findCountryByCode: deps.findCountryByCode,
        findProductByKey: deps.findProductByKey,
        identity: deps.identity,
        abuseGuard: this.abuseGuard,
        retention: this.retention,
        ...(deps.globalFlags ? { globalFlags: deps.globalFlags } : {})
      },
      audit,
      repository
    );
  }
}

export {
  WAITLIST_REPOSITORY,
  MemoryWaitlistRepository,
  PrismaWaitlistRepository,
  type WaitlistRepository,
  type WaitlistEntryRecord,
  type WaitlistEntryStatus
} from "./waitlist.repository";
