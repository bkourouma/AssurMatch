import {
  adminPartnerApplicationSchema,
  partnerApplicationConvertSchema,
  partnerApplicationCreateSchema,
  partnerApplicationRejectSchema,
  partnerApplicationReviewSchema,
  type AdminPartnerApplication,
  type PartnerApplicationConversionResult,
  type PartnerApplicationCreateInput,
  type PartnerApplicationResponse,
  type PartnerApplicationStatus
} from "../../../../packages/shared/contracts/partner-application.contracts";
import { PUBLIC_DEFAULT_LOCALE, type PublicLocale } from "../../../../packages/shared/contracts/public-site.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { partnerLicenseSchema } from "../../../../packages/shared/contracts/partner.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { Country } from "../countries/countries.module";
import { maskEmail } from "../notifications/email/email-delivery.service";
import type { PartnerApplicationDecisionNotificationPort, PublicFormNotificationPort } from "../notifications/public-form-notification.service";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { PartnerLicense, PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import { partnerConflict, partnerForbidden, partnerNotFound, partnerUnprocessable } from "../partners/partner-errors";
import type { PartnersService, PartnerTenant } from "../partners/partners.module";
import type { Product } from "../products/products.module";
import { UNKNOWN_ISSUING_AUTHORITY } from "../../../../packages/shared/contracts/licence-issuer";
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
/** Spec 051 R10 / R13: conversion and refusal are reserved to these roles (explicit role check). */
const DECISION_ROLES = new Set<AssurMatchRole>(["super_admin", "compliance_admin"]);
const DECIDED_STATUSES = new Set<PartnerApplicationStatus>(["accepted", "rejected"]);

export interface PartnerApplicationsDependencies {
  findCountryByCode: (countryCode: string) => Country | undefined | Promise<Country | undefined>;
  findProductByKey: (productKey: string) => Product | undefined | Promise<Product | undefined>;
  identity: ProspectIdentityService;
  /** Spec 047. Left out and no confirmation is sent; a submission still succeeds. */
  notifications?: PublicFormNotificationPort;
  /** Spec 051 R10: back-office decisions. Left out, `convert` is unavailable (tests of the intake). */
  decisions?: PartnerApplicationDecisionDeps;
}

export interface PartnerApplicationDecisionDeps {
  partners: Pick<PartnersService, "create">;
  licenses: Pick<PartnerLicensesService, "create">;
  findCountryById: (countryId: string) => Promise<Country | undefined>;
  /** Best effort; left out and no decision e-mail is sent (audited as not configured). */
  notifications?: PartnerApplicationDecisionNotificationPort;
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
  private readonly rbac = new RbacGuard();
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
      // Spec 047: a duplicate is confirmed like a first application, with the reference of the
      // application already on file - the same reference the response returns.
      await this.sendConfirmation(contactEmailNormalized, parsed.contactName, duplicate.publicReference, parsed.locale);
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
      // Spec 051 R10: the decision e-mail is written in the language of the application.
      locale: parsed.locale ?? PUBLIC_DEFAULT_LOCALE,
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

    await this.sendConfirmation(contactEmailNormalized, record.contactName, record.publicReference, parsed.locale);

    return this.toResponse(record.publicReference);
  }

  /**
   * Runs after the application is stored and audited, and never changes the caller's outcome. The
   * message states that compliance will review the file and request a licence copy; it creates no
   * expectation of acceptance and no partner account exists at this point (spec decision D4).
   */
  private async sendConfirmation(
    to: string,
    contactName: string,
    publicReference: string,
    locale: PublicLocale | undefined
  ): Promise<void> {
    if (!this.deps.notifications) return;
    try {
      await this.deps.notifications.confirmPartnerApplication({
        to,
        contactName,
        publicReference,
        ...(locale ? { locale } : {})
      });
    } catch {
      // The port reports its own outcome and the delivery path audits it under `email.delivery.*`;
      // an unexpected throw must not undo a recorded application.
    }
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

    return rows.map((row) => this.toAdminDto(row, "hidden"));
  }

  /**
   * Spec 051 FR-014: detail of one application. The full contact e-mail is shown to the deciding
   * roles only (compliance_admin, super_admin); the Admin Pays sees it masked.
   */
  async detailForAdmin(actor: ActorContext, id: string): Promise<AdminPartnerApplication> {
    const row = await this.requireForAdmin(actor, id);
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationAdminViewed,
      targetType: "PartnerApplication",
      targetId: row.id,
      scope: { countryId: row.countryId },
      result: "success",
      context: { status: row.status, contactEmailVisible: this.isDecisionRole(actor) }
    });
    return this.toAdminDto(row, this.isDecisionRole(actor) ? "full" : "masked");
  }

  /** FR-015: received -> under_review. `partner_applications:review` within the country scope. */
  async review(actor: ActorContext, id: string, input: unknown): Promise<AdminPartnerApplication> {
    const { reason } = partnerApplicationReviewSchema.parse(input ?? {});
    const row = await this.requireForAdmin(actor, id);
    if (!this.rbac.can(actor, "partner_applications:review")) {
      this.refuseDecision(actor, row, "review", "rbac_denied", reason);
      throw partnerForbidden();
    }
    this.assertUndecided(actor, row, "review", reason);
    if (row.status !== "received") {
      this.refuseDecision(actor, row, "review", "already_under_review", reason);
      throw partnerConflict("The application is already under review");
    }
    const now = new Date();
    const updated = await this.repository.update(row.id, { status: "under_review", ...(actor.actorId ? { reviewedById: actor.actorId } : {}), reviewedAt: now, reviewNote: reason });
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationReviewStarted,
      targetType: "PartnerApplication",
      targetId: row.id,
      scope: { countryId: row.countryId },
      result: "success",
      reason,
      context: { before: { status: row.status }, after: { status: updated.status } }
    });
    return this.toAdminDto(updated, this.isDecisionRole(actor) ? "full" : "masked");
  }

  /**
   * FR-016: one operation creates a Prospect (`draft`) partner and a draft licence from the
   * declared data, then marks the application accepted (converted) with the partner reference. It
   * is refused when the country's broker onboarding is off. The decision is final.
   */
  async convert(actor: ActorContext, id: string, input: unknown): Promise<PartnerApplicationConversionResult> {
    const { reason } = partnerApplicationConvertSchema.parse(input ?? {});
    const row = await this.requireForAdmin(actor, id);
    this.assertDecisionRole(actor, row, "convert", reason);
    this.assertUndecided(actor, row, "convert", reason);
    const decisions = this.deps.decisions;
    if (!decisions) throw new Error("Partner application conversion is not configured");
    const country = await decisions.findCountryById(row.countryId);
    if (!country?.flags.country_broker_onboarding_enabled) {
      this.refuseDecision(actor, row, "convert", "broker_onboarding_disabled", reason);
      throw partnerUnprocessable(ErrorCodes.COUNTRY_BROKER_ONBOARDING_DISABLED, "Broker onboarding is disabled for the country of this application");
    }

    // The licence is written after the partner: validate its declared data first so a refused
    // licence never leaves an orphan draft partner behind (the two writes are not transactional).
    const licenseDraft = {
      licenseNumber: row.licenseNumber,
      issuingAuthority: row.licenseIssuingAuthority ?? UNKNOWN_ISSUING_AUTHORITY,
      countryId: row.countryId,
      productIds: row.productIds,
      status: "draft" as const,
      effectiveDate: new Date().toISOString().slice(0, 10),
      expirationDate: new Date(row.licenseExpiresAt).toISOString().slice(0, 10)
    };
    if (!partnerLicenseSchema.safeParse({ ...licenseDraft, partnerTenantId: crypto.randomUUID() }).success) {
      this.refuseDecision(actor, row, "convert", "declared_license_invalid", reason);
      throw partnerUnprocessable(ErrorCodes.VALIDATION_FAILED, "The licence declared in this application is invalid; complete it before conversion");
    }

    const partner: PartnerTenant = await decisions.partners.create({
      legalName: row.legalName,
      ...(row.tradeName ? { tradeName: row.tradeName } : {}),
      countryId: row.countryId,
      plan: row.desiredPlan,
      status: "draft",
      primaryEmail: row.contactEmailNormalized,
      primaryWhatsApp: row.whatsapp ?? row.contactPhone,
      adminContactName: row.contactName,
      adminContactEmail: row.contactEmailNormalized,
      adminContactPhone: row.contactPhone,
      quotaMonthlyLeads: row.monthlyCapacity
    }, actor, `converted from application ${row.publicReference}: ${reason}`);
    const license: PartnerLicense = await decisions.licenses.create({ ...licenseDraft, partnerTenantId: partner.id }, actor, `declared in application ${row.publicReference}: ${reason}`);

    const now = new Date();
    const updated = await this.repository.update(row.id, {
      status: "accepted",
      partnerTenantId: partner.id,
      ...(actor.actorId ? { reviewedById: actor.actorId } : {}),
      reviewedAt: now,
      reviewNote: reason,
      decidedAt: now
    });
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationConverted,
      targetType: "PartnerApplication",
      targetId: row.id,
      scope: { countryId: row.countryId, partnerTenantId: partner.id },
      result: "success",
      reason,
      context: { before: { status: row.status }, after: { status: "accepted", partnerTenantId: partner.id, licenseId: license.id } }
    });
    await this.notifyDecision(actor, updated, "accepted");
    return { application: this.toAdminDto(updated, "full"), partnerTenantId: partner.id, licenseId: license.id };
  }

  /** FR-015: refusal with a closed-list reason; the internal note is never e-mailed. Final. */
  async reject(actor: ActorContext, id: string, input: unknown): Promise<AdminPartnerApplication> {
    const { rejectionReasonCode, reason } = partnerApplicationRejectSchema.parse(input ?? {});
    const row = await this.requireForAdmin(actor, id);
    this.assertDecisionRole(actor, row, "reject", reason);
    this.assertUndecided(actor, row, "reject", reason);
    const now = new Date();
    const updated = await this.repository.update(row.id, {
      status: "rejected",
      rejectionReasonCode,
      ...(actor.actorId ? { reviewedById: actor.actorId } : {}),
      reviewedAt: now,
      reviewNote: reason,
      decidedAt: now
    });
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationRejected,
      targetType: "PartnerApplication",
      targetId: row.id,
      scope: { countryId: row.countryId },
      result: "success",
      reason,
      context: { before: { status: row.status }, after: { status: "rejected", rejectionReasonCode } }
    });
    await this.notifyDecision(actor, updated, "rejected");
    return this.toAdminDto(updated, "full");
  }

  /**
   * FR-017 / SC-008: best effort. The decision is stored before this runs and never undone; the
   * outcome is audited (a failure or a missing transport is recorded, never thrown).
   */
  private async notifyDecision(actor: ActorContext, row: PartnerApplicationRecord, decision: "accepted" | "rejected"): Promise<void> {
    const port = this.deps.decisions?.notifications;
    let emailStatus: string = "not_configured";
    if (port) {
      try {
        emailStatus = await port.notifyPartnerApplicationDecision({
          to: row.contactEmailNormalized,
          contactName: row.contactName,
          publicReference: row.publicReference,
          decision,
          locale: row.locale ?? PUBLIC_DEFAULT_LOCALE
        });
      } catch {
        emailStatus = "failed";
      }
    }
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationDecisionNotified,
      targetType: "PartnerApplication",
      targetId: row.id,
      scope: { countryId: row.countryId },
      result: emailStatus === "sent" || emailStatus === "previewed" ? "success" : emailStatus === "failed" ? "failed" : "refused",
      context: { decision, emailStatus, locale: row.locale ?? PUBLIC_DEFAULT_LOCALE, recipientMasked: maskEmail(row.contactEmailNormalized) }
    });
  }

  private isDecisionRole(actor: ActorContext): boolean {
    return actor.roles.some((role) => DECISION_ROLES.has(role));
  }

  private assertDecisionRole(actor: ActorContext, row: PartnerApplicationRecord, decision: string, reason: string): void {
    if (this.isDecisionRole(actor)) return;
    this.refuseDecision(actor, row, decision, "decision_requires_compliance", reason);
    throw partnerForbidden();
  }

  private assertUndecided(actor: ActorContext, row: PartnerApplicationRecord, decision: string, reason: string): void {
    if (!DECIDED_STATUSES.has(row.status)) return;
    this.refuseDecision(actor, row, decision, "application_already_decided", reason);
    throw partnerConflict(`The application is already ${row.status}; a decision is final`, ErrorCodes.APPLICATION_ALREADY_DECIDED);
  }

  private refuseDecision(actor: ActorContext, row: PartnerApplicationRecord, decision: string, refusal: string, reason?: string): void {
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.partnerApplicationDecisionRefused,
      targetType: "PartnerApplication",
      targetId: row.id,
      scope: { countryId: row.countryId },
      result: "refused",
      reason: refusal,
      context: { decision, status: row.status, ...(reason ? { requestReason: reason } : {}) }
    });
  }

  /** Admin read rights and country scope; an application outside the scope reads as not found. */
  private async requireForAdmin(actor: ActorContext, id: string): Promise<PartnerApplicationRecord> {
    if (!actor.roles.some((role) => ADMIN_READ_ROLES.has(role))) throw partnerForbidden();
    const row = await this.repository.find(id);
    if (!row || this.scopeToActor(actor, [row]).length === 0) throw partnerNotFound(`Partner application ${id} not found`);
    return row;
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

  /**
   * `hidden`: no contact e-mail (lists). `masked`: first letter and domain (Admin Pays detail).
   * `full`: the deciding roles only (spec 051 R10).
   */
  private toAdminDto(row: PartnerApplicationRecord, email: "hidden" | "masked" | "full"): AdminPartnerApplication {
    return adminPartnerApplicationSchema.parse({
      id: row.id,
      publicReference: row.publicReference,
      countryId: row.countryId,
      legalName: row.legalName,
      ...(row.tradeName ? { tradeName: row.tradeName } : {}),
      licenseNumber: row.licenseNumber,
      ...(row.licenseIssuingAuthority ? { licenseIssuingAuthority: row.licenseIssuingAuthority } : {}),
      licenseExpiresAt: new Date(row.licenseExpiresAt).toISOString(),
      productIds: row.productIds,
      monthlyCapacity: row.monthlyCapacity,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      ...(row.whatsapp ? { whatsapp: row.whatsapp } : {}),
      desiredPlan: row.desiredPlan,
      ...(row.message ? { message: row.message } : {}),
      status: row.status,
      ...(row.reviewedById ? { reviewedById: row.reviewedById } : {}),
      ...(row.reviewedAt ? { reviewedAt: new Date(row.reviewedAt).toISOString() } : {}),
      ...(row.reviewNote ? { reviewNote: row.reviewNote } : {}),
      ...(row.partnerTenantId ? { partnerTenantId: row.partnerTenantId } : {}),
      ...(row.rejectionReasonCode ? { rejectionReasonCode: row.rejectionReasonCode } : {}),
      ...(row.decidedAt ? { decidedAt: new Date(row.decidedAt).toISOString() } : {}),
      locale: row.locale ?? PUBLIC_DEFAULT_LOCALE,
      ...(email === "full" ? { contactEmail: row.contactEmailNormalized, contactEmailMasked: false } : {}),
      ...(email === "masked" ? { contactEmail: maskEmail(row.contactEmailNormalized), contactEmailMasked: true } : {}),
      createdAt: new Date(row.createdAt).toISOString()
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
