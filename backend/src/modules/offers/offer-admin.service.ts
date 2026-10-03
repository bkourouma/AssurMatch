import type { ZodType } from "zod";
import {
  adminOfferListQuerySchema,
  type AdminOfferDetailView,
  type AdminOfferListItem,
  type AdminOfferListQuery
} from "../../../../packages/shared/contracts/offer-content";
import {
  adminOfferUpsertSchema,
  offerValidationSchema,
  type AdminOfferUpsertDto,
  type OfferValidationDto
} from "../../../../packages/shared/contracts/quote.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { OfferErrorCodes, offerForbidden, offerInvalid, offerNotFound, offerUnprocessable } from "./offer-errors";
import { OfferAuditActions, OfferLifecycleService } from "./offer-lifecycle.service";
import { daysUntil, effectiveOfferStatus, pendingVersion, publishedVersion, toAdminOfferDetail, toAdminOfferListItem } from "./offer-views";
import type { OfferRecord, OfferVersionContent } from "./offers.module";
import type { OffersRepository } from "./offers.repository";

const DEFAULT_ADMIN_REASON = "Administration de l'offre";

/** Parses an offer payload; the refusal message names the failing rule (e.g. the forbidden wording). */
export function parseOfferInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw offerInvalid(`Validation failed: ${result.error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")}`);
  }
  return result.data;
}

type ParsedContent = {
  name: string;
  shortDescription?: string | undefined;
  guaranteeSummary?: string | undefined;
  exclusionsSummary?: string | undefined;
  insurerName?: string | undefined;
  guarantees: OfferVersionContent["guarantees"];
  guaranteeLevel?: number | undefined;
  deductibleAmount?: number | undefined;
  coverageCeiling?: number | undefined;
  processingDelayDays?: number | undefined;
  paymentFlexibility?: OfferVersionContent["paymentFlexibility"] | undefined;
  requiredDocuments: string[];
  sourceOfInformation?: string | undefined;
  indicativePriceMin?: number | undefined;
  indicativePriceMax?: number | undefined;
  currency: string;
  pricingUnit?: string | undefined;
  validFrom: string;
  validUntil: string;
  publicDisclaimers: string[];
};

/** Parsed payload → version content. Blank optional strings are stored as absent. */
export function contentFromInput(parsed: ParsedContent, sponsorship: { isSponsored: boolean; sponsorLabel?: string | undefined; displayPriority?: number | undefined }): OfferVersionContent {
  const text = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);
  return {
    name: parsed.name.trim(),
    shortDescription: text(parsed.shortDescription),
    guaranteeSummary: text(parsed.guaranteeSummary),
    exclusionsSummary: text(parsed.exclusionsSummary),
    insurerName: text(parsed.insurerName),
    guarantees: parsed.guarantees,
    guaranteeLevel: parsed.guaranteeLevel,
    deductibleAmount: parsed.deductibleAmount,
    coverageCeiling: parsed.coverageCeiling,
    processingDelayDays: parsed.processingDelayDays,
    paymentFlexibility: parsed.paymentFlexibility,
    requiredDocuments: parsed.requiredDocuments,
    sourceOfInformation: text(parsed.sourceOfInformation),
    indicativePriceMin: parsed.indicativePriceMin,
    indicativePriceMax: parsed.indicativePriceMax,
    currency: parsed.currency,
    pricingUnit: text(parsed.pricingUnit),
    validFrom: new Date(parsed.validFrom),
    validUntil: new Date(parsed.validUntil),
    publicDisclaimers: parsed.publicDisclaimers,
    isSponsored: sponsorship.isSponsored,
    sponsorLabel: text(sponsorship.sponsorLabel),
    displayPriority: sponsorship.displayPriority ?? 0
  } as OfferVersionContent;
}

/**
 * Spec 052 US2/US5: admin side of the offers. Country admins and content admins prepare offers for
 * a partner of their scope (`offers:update`); validation, refusal and suspension are reserved to
 * Compliance Admin and Super Admin (R4, a restriction of the former behaviour). Every refusal is
 * audited.
 */
export class OfferAdminService {
  constructor(
    private readonly repository: OffersRepository,
    private readonly audit: AuditLogWriter,
    readonly lifecycle: OfferLifecycleService = new OfferLifecycleService(repository, audit)
  ) {}

  isCompliance(actor: ActorContext): boolean {
    return actor.roles.includes("compliance_admin") || actor.roles.includes("super_admin");
  }

  inCountryScope(actor: ActorContext, countryId: string): boolean {
    if (actor.roles.includes("super_admin") || actor.roles.includes("compliance_admin")) return true;
    return !actor.countryScopes?.length || actor.countryScopes.includes(countryId);
  }

  canRead(actor: ActorContext): boolean {
    return actor.roles.some((role) => roleHasPermission(role, "offers:read"));
  }

  canWrite(actor: ActorContext): boolean {
    return actor.roles.some((role) => roleHasPermission(role, "offers:update"));
  }

  async create(input: AdminOfferUpsertDto | unknown, actor: ActorContext): Promise<OfferRecord> {
    this.requireAccess(actor, this.canWrite(actor), undefined, "create", "forbidden_role");
    const parsed = parseOfferInput(adminOfferUpsertSchema, input);
    this.requireAccess(actor, this.inCountryScope(actor, parsed.countryId), undefined, "create", "out_of_scope_country", { countryId: parsed.countryId });
    if (parsed.partnerTenantId) await this.assertCoverage(actor, parsed.partnerTenantId, parsed.countryId, parsed.productId);
    const { offer } = await this.lifecycle.create({
      id: parsed.id,
      countryId: parsed.countryId,
      productId: parsed.productId,
      partnerTenantId: parsed.partnerTenantId,
      publicKey: parsed.publicKey,
      offerType: parsed.offerType,
      content: contentFromInput(parsed, parsed)
    }, actor, "admin", parsed.reason);
    return offer;
  }

  /** FR-014: versioned; the scope checked is the one of the stored offer (C3). */
  async update(id: string, input: AdminOfferUpsertDto | unknown, actor: ActorContext): Promise<OfferRecord> {
    this.requireAccess(actor, this.canWrite(actor), undefined, "update", "forbidden_role");
    const offer = await this.requireInScope(id, actor, "update");
    const parsed = parseOfferInput(adminOfferUpsertSchema, input);
    if (parsed.countryId !== offer.countryId || parsed.productId !== offer.productId) {
      this.lifecycle.refused(actor, offer, "update", "scope_change_refused");
      throw offerInvalid("Validation failed: the country and the product of an offer cannot change");
    }
    if (parsed.partnerTenantId !== offer.partnerTenantId) {
      if (offer.publishedVersionId || !parsed.partnerTenantId) {
        this.lifecycle.refused(actor, offer, "update", "partner_change_refused");
        throw offerInvalid("Validation failed: the partner of a published offer cannot change");
      }
      await this.assertCoverage(actor, parsed.partnerTenantId, offer.countryId, offer.productId);
      Object.assign(offer, await this.repository.update(offer.id, { partnerTenantId: parsed.partnerTenantId }));
    }
    await this.lifecycle.saveContent(offer, contentFromInput(parsed, parsed), { actor, authorRole: "admin", reason: parsed.reason, expectedUpdatedAt: parsed.expectedUpdatedAt });
    return this.repository.require(offer.id);
  }

  async submit(id: string, reason: string | undefined, actor: ActorContext): Promise<OfferRecord> {
    this.requireAccess(actor, this.canWrite(actor) || this.isCompliance(actor), undefined, "submit", "forbidden_role");
    const offer = await this.requireInScope(id, actor, "submit");
    await this.lifecycle.submit(offer, actor, reason ?? DEFAULT_ADMIN_REASON);
    return this.repository.require(offer.id);
  }

  /** R6: `{ reason }`; the former `{ validationStatus: "rejected", reason }` is a refusal. */
  async validate(id: string, input: OfferValidationDto | unknown, actor: ActorContext): Promise<OfferRecord> {
    this.requireAccess(actor, this.isCompliance(actor), undefined, "validate", "compliance_required");
    const parsed = parseOfferInput(offerValidationSchema, input);
    const offer = await this.requireOffer(id, actor, "validate");
    if (parsed.validationStatus === "rejected") {
      await this.lifecycle.reject(offer, actor, parsed.reason);
      return this.repository.require(offer.id);
    }
    return this.lifecycle.validate(offer, actor, parsed.reason);
  }

  async reject(id: string, reason: string, actor: ActorContext): Promise<OfferRecord> {
    this.requireAccess(actor, this.isCompliance(actor), undefined, "reject", "compliance_required");
    const offer = await this.requireOffer(id, actor, "reject");
    await this.lifecycle.reject(offer, actor, reason);
    return this.repository.require(offer.id);
  }

  async suspend(id: string, reason: string, actor: ActorContext): Promise<OfferRecord> {
    this.requireAccess(actor, this.isCompliance(actor), undefined, "suspend", "compliance_required");
    const offer = await this.requireOffer(id, actor, "suspend");
    return this.lifecycle.suspend(offer, actor, reason);
  }

  /** Raw records (internal callers: dashboards, checklists). */
  list(): Promise<OfferRecord[]> {
    return this.repository.list();
  }

  require(id: string): Promise<OfferRecord> {
    return this.repository.require(id);
  }

  /** FR-010: filtered list restricted to the actor's country scope (C3). R9 reminders come from the spec 061 scheduled job. */
  async listViews(query: unknown, actor: ActorContext): Promise<AdminOfferListItem[]> {
    this.requireAccess(actor, this.canRead(actor), undefined, "list", "forbidden_role");
    const parsed: AdminOfferListQuery = parseOfferInput(adminOfferListQuerySchema, query ?? {});
    const now = new Date();
    const scoped = (await this.repository.list()).filter((offer) => this.inCountryScope(actor, offer.countryId));
    const items: AdminOfferListItem[] = [];
    const names = new Map<string, string | undefined>();
    for (const offer of scoped) {
      if (parsed.countryId && offer.countryId !== parsed.countryId) continue;
      if (parsed.productId && offer.productId !== parsed.productId) continue;
      if (parsed.partnerTenantId && offer.partnerTenantId !== parsed.partnerTenantId) continue;
      const versions = await this.lifecycle.versions(offer);
      const pending = pendingVersion(offer, versions);
      const published = publishedVersion(offer, versions);
      if (parsed.queue === "submitted" && pending?.status !== "submitted") continue;
      if (parsed.status && effectiveOfferStatus(offer, versions, now) !== parsed.status) continue;
      if (parsed.sponsored !== undefined && (published?.isSponsored ?? pending?.isSponsored ?? offer.isSponsored) !== parsed.sponsored) continue;
      if (parsed.expiringWithinDays !== undefined) {
        const days = published && (offer.status === "active" || offer.status === "validated") ? daysUntil(published.validUntil, now) : undefined;
        if (days === undefined || days < 0 || published!.validUntil <= now || days > parsed.expiringWithinDays) continue;
      }
      items.push(toAdminOfferListItem(offer, versions, { partnerName: await this.partnerName(offer, names), suspensionReason: await this.lifecycle.suspensionReason(offer) }, now));
    }
    return items.sort((a, b) => {
      // The validation queue is served oldest submission first; the catalogue newest first.
      if (parsed.queue === "submitted") return (a.pending?.submittedAt ?? "").localeCompare(b.pending?.submittedAt ?? "");
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  async detail(id: string, actor: ActorContext): Promise<AdminOfferDetailView> {
    this.requireAccess(actor, this.canRead(actor), undefined, "detail", "forbidden_role");
    const offer = await this.requireInScope(id, actor, "detail");
    return this.detailView(offer);
  }

  async detailView(offer: OfferRecord): Promise<AdminOfferDetailView> {
    const fresh = await this.repository.require(offer.id);
    const versions = await this.lifecycle.versions(fresh);
    return toAdminOfferDetail(fresh, versions, { partnerName: await this.partnerName(fresh, new Map()), suspensionReason: await this.lifecycle.suspensionReason(fresh) });
  }

  private async partnerName(offer: OfferRecord, cache: Map<string, string | undefined>): Promise<string | undefined> {
    if (!offer.partnerTenantId || !this.lifecycle.integrations.partnerName) return undefined;
    if (!cache.has(offer.partnerTenantId)) cache.set(offer.partnerTenantId, await this.lifecycle.integrations.partnerName(offer.partnerTenantId).catch(() => undefined));
    return cache.get(offer.partnerTenantId);
  }

  private async assertCoverage(actor: ActorContext, partnerTenantId: string, countryId: string, productId: string): Promise<void> {
    const blockers = await this.lifecycle.integrations.coverage?.(partnerTenantId, countryId, productId) ?? [];
    if (!blockers.length) return;
    this.lifecycle.refused(actor, { id: "new", countryId, productId, partnerTenantId }, "create", "scope_not_covered", { blockers });
    throw offerUnprocessable(OfferErrorCodes.scopeNotCovered, "The partner does not cover this country and product", blockers.map((code) => ({ code })));
  }

  private async requireOffer(id: string, actor: ActorContext, operation: string): Promise<OfferRecord> {
    const offer = await this.repository.find(id);
    if (!offer) {
      this.lifecycle.refused(actor, undefined, operation, "offer_not_found", { offerId: id });
      throw offerNotFound();
    }
    return offer;
  }

  private async requireInScope(id: string, actor: ActorContext, operation: string): Promise<OfferRecord> {
    const offer = await this.requireOffer(id, actor, operation);
    this.requireAccess(actor, this.inCountryScope(actor, offer.countryId), offer, operation, "out_of_scope_country");
    return offer;
  }

  private requireAccess(actor: ActorContext, allowed: boolean, offer: OfferRecord | undefined, operation: string, refusal: string, context: Record<string, unknown> = {}): void {
    if (allowed) return;
    this.audit.write({
      actor,
      action: OfferAuditActions.accessRefused,
      targetType: "Offer",
      targetId: offer?.id ?? "offers",
      scope: offer ? { countryId: offer.countryId, productId: offer.productId } : {},
      result: "refused",
      reason: refusal,
      context: { operation, roles: actor.roles, ...context }
    });
    throw offerForbidden(refusal === "compliance_required" ? "RBAC denied: offer decisions are reserved to compliance" : "RBAC denied");
  }
}
