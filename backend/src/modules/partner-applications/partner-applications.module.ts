import {
  adminPartnerApplicationSchema,
  partnerApplicationCreateSchema,
  type AdminPartnerApplication,
  type PartnerApplicationCreateInput,
  type PartnerApplicationResponse,
  type PartnerApplicationStatus
} from "../../../../packages/shared/contracts/partner-application.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { Country } from "../countries/countries.module";
import type { Product } from "../products/products.module";
import type { ProspectIdentityService } from "../prospects/prospect-identity.service";
import {
  MemoryPartnerApplicationsRepository,
  type PartnerApplicationRecord,
  type PartnerApplicationsListFilter,
  type PartnerApplicationsRepository
} from "./partner-applications.repository";

const RATE_LIMIT_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RETENTION_YEARS = 5;
const CONSENT_VERSION = "partner-application-v1";
const CLOSED_COUNTRY_STATUSES = new Set(["draft", "suspended", "retired"]);
const ADMIN_READ_ROLES = new Set<AssurMatchRole>(["super_admin", "admin_pays", "compliance_admin"]);

export interface PartnerApplicationsDependencies {
  findCountryByCode: (countryCode: string) => Country | undefined | Promise<Country | undefined>;
  findProductByKey: (productKey: string) => Product | undefined | Promise<Product | undefined>;
  identity: ProspectIdentityService;
}

export interface PartnerApplicationSubmitContext {
  ipAddress: string;
  actor?: ActorContext;
}

/**
 * Public-site intake for brokers who want to become AssurMatch partners. This service only ever
 * records evidence of intent (spec decision D4): it never creates a `PartnerTenant`, a
 * `PartnerLicense` or any authorisation, and the response tells the applicant a copy of their
 * licence will be requested by e-mail because file upload is deliberately out of scope (D5).
 */
export class PartnerApplicationsService {
  private readonly abuseGuard: PublicAbuseGuardService;
  private readonly retention = new RetentionPolicyService();

  constructor(
    private readonly deps: PartnerApplicationsDependencies,
    private readonly audit: AuditLogWriter = new AuditLogWriter(),
    private readonly redis: RedisClientPort = new InMemoryRedisClient(),
    private readonly repository: PartnerApplicationsRepository = new MemoryPartnerApplicationsRepository()
  ) {
    this.abuseGuard = new PublicAbuseGuardService(this.redis);
  }

  async submit(rawInput: unknown, context: PartnerApplicationSubmitContext): Promise<PartnerApplicationResponse> {
    const draft = this.asRecord(rawInput);
    await this.abuseGuard.assertAllowed({
      scope: "partner_application",
      ipAddress: context.ipAddress,
      ...(typeof draft.sessionId === "string" ? { sessionId: draft.sessionId } : {}),
      ...(typeof draft.website === "string" ? { honeypot: draft.website } : {}),
      limitPerWindow: RATE_LIMIT_PER_WINDOW,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS
    });

    const parsed = this.parseInput(rawInput);

    const country = await this.deps.findCountryByCode(parsed.countryCode);
    if (!country || CLOSED_COUNTRY_STATUSES.has(country.status)) {
      throw new Error("Country not found");
    }

    if (!country.flags.country_broker_onboarding_enabled) {
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationRefused,
        targetType: "PartnerApplication",
        targetId: country.id,
        scope: { countryId: country.id },
        result: "refused",
        reason: "broker_onboarding_disabled",
        context: { countryId: country.id, desiredPlan: parsed.desiredPlan }
      });
      throw new Error("Broker onboarding is disabled for this country");
    }

    const productIds = await this.resolveProductIds(parsed.productKeys, country);

    const licenseExpiresAt = new Date(`${parsed.licenseExpiresAt}T00:00:00.000Z`);
    if (Number.isNaN(licenseExpiresAt.getTime()) || licenseExpiresAt.getTime() <= Date.now()) {
      throw new Error("Validation failed: licenseExpiresAt must be strictly in the future");
    }

    const contactEmailNormalized = parsed.contactEmail.trim().toLowerCase();
    const contactEmailFingerprint = this.deps.identity.fingerprint(contactEmailNormalized);

    const duplicate = await this.repository.findDuplicate(country.id, contactEmailFingerprint, parsed.licenseNumber);
    if (duplicate) {
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationDuplicateIgnored,
        targetType: "PartnerApplication",
        targetId: duplicate.id,
        scope: { countryId: country.id },
        result: "refused",
        reason: "duplicate_application",
        context: { countryId: country.id, desiredPlan: parsed.desiredPlan, contactEmailFingerprint }
      });
      return this.toResponse(duplicate.publicReference);
    }

    const now = new Date();
    const record: PartnerApplicationRecord = {
      id: crypto.randomUUID(),
      publicReference: this.generatePublicReference(now),
      countryId: country.id,
      legalName: parsed.legalName,
      ...(parsed.tradeName ? { tradeName: parsed.tradeName } : {}),
      licenseNumber: parsed.licenseNumber,
      ...(parsed.licenseIssuingAuthority ? { licenseIssuingAuthority: parsed.licenseIssuingAuthority } : {}),
      licenseExpiresAt,
      productIds,
      monthlyCapacity: parsed.monthlyCapacity,
      contactName: parsed.contactName,
      contactEmailNormalized,
      contactEmailFingerprint,
      contactPhone: parsed.contactPhone,
      ...(parsed.whatsapp ? { whatsapp: parsed.whatsapp } : {}),
      desiredPlan: parsed.desiredPlan,
      ...(parsed.message ? { message: parsed.message } : {}),
      consentVersion: CONSENT_VERSION,
      status: "received",
      ipHash: QuoteRedisKeys.ipHash(context.ipAddress),
      retentionUntil: this.retention.retentionUntil(now, RETENTION_YEARS),
      createdAt: now,
      updatedAt: now
    };

    await this.repository.create(record);

    this.audit.write({
      actor: context.actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationReceived,
      targetType: "PartnerApplication",
      targetId: record.id,
      scope: { countryId: country.id },
      result: "success",
      context: { countryId: country.id, desiredPlan: parsed.desiredPlan, productIds, contactEmailFingerprint }
    });

    return this.toResponse(record.publicReference);
  }

  async listForAdmin(actor: ActorContext, filter: PartnerApplicationsListFilter = {}): Promise<AdminPartnerApplication[]> {
    this.assertAdminRead(actor, filter.countryId);
    const rows = this.scopeToActor(actor, await this.repository.list(filter));

    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationAdminListed,
      targetType: "PartnerApplication",
      targetId: "list",
      scope: { ...(filter.countryId ? { countryId: filter.countryId } : {}) },
      result: "success",
      context: { count: rows.length, ...(filter.status ? { status: filter.status } : {}) }
    });

    return rows.map((row) => this.toAdminDto(row));
  }

  private async resolveProductIds(productKeys: readonly string[], country: Country): Promise<string[]> {
    const productIds: string[] = [];
    for (const productKey of productKeys) {
      const product = await this.deps.findProductByKey(productKey);
      if (!product || !product.countryIds.includes(country.id)) {
        throw new Error(`Validation failed: product "${productKey}" is not available in this country`);
      }
      productIds.push(product.id);
    }
    return productIds;
  }

  private assertAdminRead(actor: ActorContext, countryId: string | undefined): void {
    if (!actor.roles.some((role) => ADMIN_READ_ROLES.has(role))) {
      throw new Error("RBAC denied");
    }
    if (actor.roles.includes("super_admin")) return;
    if (countryId && actor.countryScopes?.length && !actor.countryScopes.includes(countryId)) {
      throw new Error("RBAC denied: out_of_scope_country");
    }
  }

  private scopeToActor(actor: ActorContext, rows: PartnerApplicationRecord[]): PartnerApplicationRecord[] {
    if (actor.roles.includes("super_admin") || !actor.countryScopes?.length) return rows;
    const scopes = actor.countryScopes;
    return rows.filter((row) => scopes.includes(row.countryId));
  }

  private toAdminDto(row: PartnerApplicationRecord): AdminPartnerApplication {
    return adminPartnerApplicationSchema.parse({
      id: row.id,
      publicReference: row.publicReference,
      countryId: row.countryId,
      legalName: row.legalName,
      ...(row.tradeName ? { tradeName: row.tradeName } : {}),
      licenseNumber: row.licenseNumber,
      ...(row.licenseIssuingAuthority ? { licenseIssuingAuthority: row.licenseIssuingAuthority } : {}),
      licenseExpiresAt: row.licenseExpiresAt.toISOString(),
      productIds: row.productIds,
      monthlyCapacity: row.monthlyCapacity,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      ...(row.whatsapp ? { whatsapp: row.whatsapp } : {}),
      desiredPlan: row.desiredPlan,
      ...(row.message ? { message: row.message } : {}),
      status: row.status,
      ...(row.reviewedById ? { reviewedById: row.reviewedById } : {}),
      ...(row.reviewedAt ? { reviewedAt: row.reviewedAt.toISOString() } : {}),
      ...(row.reviewNote ? { reviewNote: row.reviewNote } : {}),
      ...(row.partnerTenantId ? { partnerTenantId: row.partnerTenantId } : {}),
      createdAt: row.createdAt.toISOString()
    });
  }

  private toResponse(publicReference: string): PartnerApplicationResponse {
    return {
      status: "received",
      publicReference,
      message: "Votre candidature a bien ete recue. Notre equipe conformite va l'etudier et vous contactera par e-mail pour demander une copie de votre licence.",
      nextSteps: [
        "Surveillez votre e-mail: nous vous ecrirons pour demander une copie de votre licence, car aucun depot de fichier n'est disponible sur ce formulaire.",
        "Notre equipe conformite examine votre dossier avant toute activation.",
        "Aucun compte partenaire n'est cree tant que votre dossier n'a pas ete valide."
      ]
    };
  }

  private generatePublicReference(now: Date): string {
    return `PA-${now.getUTCFullYear()}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private parseInput(rawInput: unknown): PartnerApplicationCreateInput {
    const result = partnerApplicationCreateSchema.safeParse(rawInput);
    if (!result.success) {
      const details = result.error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");
      throw new Error(`Validation failed: ${details}`);
    }
    return result.data;
  }

  private asRecord(rawInput: unknown): Record<string, unknown> {
    return rawInput && typeof rawInput === "object" ? (rawInput as Record<string, unknown>) : {};
  }
}

export class PartnerApplicationsModule {
  readonly service: PartnerApplicationsService;

  constructor(
    deps: PartnerApplicationsDependencies,
    audit: AuditLogWriter = new AuditLogWriter(),
    redis: RedisClientPort = new InMemoryRedisClient(),
    repository?: PartnerApplicationsRepository
  ) {
    this.service = new PartnerApplicationsService(deps, audit, redis, repository);
  }
}

export type { PartnerApplicationStatus, PartnerApplicationsListFilter };
