import {
  adminOfferUpsertSchema,
  offerValidationSchema,
  type AdminOfferUpsertDto,
  type OfferValidationDto
} from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import type { OfferHistoryRecord, OfferRecord } from "./offers.module";

export class OfferAdminService {
  constructor(
    private readonly offers: OfferRecord[],
    private readonly history: OfferHistoryRecord[],
    private readonly audit: AuditLogWriter
  ) {}

  create(input: AdminOfferUpsertDto, actor: ActorContext): OfferRecord {
    const parsed = adminOfferUpsertSchema.parse(input);
    const now = new Date();
    const offer: OfferRecord = {
      id: parsed.id ?? crypto.randomUUID(),
      countryId: parsed.countryId,
      productId: parsed.productId,
      ...(parsed.partnerTenantId ? { partnerTenantId: parsed.partnerTenantId } : {}),
      publicKey: parsed.publicKey ?? parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name: parsed.name,
      ...(parsed.shortDescription ? { shortDescription: parsed.shortDescription } : {}),
      ...(parsed.guaranteeSummary ? { guaranteeSummary: parsed.guaranteeSummary } : {}),
      ...(parsed.indicativePriceMin !== undefined ? { indicativePriceMin: parsed.indicativePriceMin } : {}),
      ...(parsed.indicativePriceMax !== undefined ? { indicativePriceMax: parsed.indicativePriceMax } : {}),
      currency: parsed.currency,
      ...(parsed.pricingUnit ? { pricingUnit: parsed.pricingUnit } : {}),
      status: "draft",
      validationStatus: "pending",
      validFrom: new Date(parsed.validFrom),
      validUntil: new Date(parsed.validUntil),
      isSponsored: parsed.isSponsored,
      ...(parsed.sponsorLabel ? { sponsorLabel: parsed.sponsorLabel } : {}),
      displayPriority: 0,
      publicDisclaimers: parsed.publicDisclaimers,
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    this.offers.push(offer);
    this.recordHistory(offer.id, "created", undefined, offer, parsed.reason, actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.offerAdminCreated,
      targetType: "Offer",
      targetId: offer.id,
      scope: { countryId: offer.countryId, productId: offer.productId },
      result: "success",
      reason: parsed.reason,
      context: { isSponsored: offer.isSponsored }
    });
    return offer;
  }

  update(id: string, input: AdminOfferUpsertDto, actor: ActorContext): OfferRecord {
    const parsed = adminOfferUpsertSchema.parse(input);
    const offer = this.require(id);
    const previous = { ...offer };
    Object.assign(offer, {
      countryId: parsed.countryId,
      productId: parsed.productId,
      partnerTenantId: parsed.partnerTenantId,
      name: parsed.name,
      shortDescription: parsed.shortDescription,
      guaranteeSummary: parsed.guaranteeSummary,
      indicativePriceMin: parsed.indicativePriceMin,
      indicativePriceMax: parsed.indicativePriceMax,
      currency: parsed.currency,
      pricingUnit: parsed.pricingUnit,
      validFrom: new Date(parsed.validFrom),
      validUntil: new Date(parsed.validUntil),
      isSponsored: parsed.isSponsored,
      sponsorLabel: parsed.sponsorLabel,
      publicDisclaimers: parsed.publicDisclaimers,
      updatedAt: new Date()
    });
    this.recordHistory(offer.id, "updated", previous, offer, parsed.reason, actor);
    return offer;
  }

  validate(id: string, input: OfferValidationDto, actor: ActorContext): OfferRecord {
    const parsed = offerValidationSchema.parse(input);
    const offer = this.require(id);
    offer.validationStatus = parsed.validationStatus;
    offer.status = parsed.validationStatus === "validated" ? "active" : "review";
    if (parsed.validationStatus === "validated") {
      if (actor.actorId) offer.validatedById = actor.actorId;
      offer.validatedAt = new Date();
    }
    offer.updatedAt = new Date();
    this.recordHistory(offer.id, "validated", undefined, { validationStatus: offer.validationStatus, status: offer.status }, parsed.reason, actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.offerAdminValidated,
      targetType: "Offer",
      targetId: offer.id,
      scope: { countryId: offer.countryId, productId: offer.productId },
      result: "success",
      reason: parsed.reason,
      context: { validationStatus: offer.validationStatus }
    });
    return offer;
  }

  suspend(id: string, reason: string, actor: ActorContext): OfferRecord {
    const offer = this.require(id);
    offer.status = "suspended";
    offer.updatedAt = new Date();
    this.recordHistory(offer.id, "suspended", undefined, { status: offer.status }, reason, actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.offerAdminSuspended,
      targetType: "Offer",
      targetId: offer.id,
      scope: { countryId: offer.countryId, productId: offer.productId },
      result: "success",
      reason,
      context: {}
    });
    return offer;
  }

  list(): OfferRecord[] {
    return [...this.offers];
  }

  require(id: string): OfferRecord {
    const offer = this.offers.find((candidate) => candidate.id === id);
    if (!offer) throw new Error(`Offer ${id} not found`);
    return offer;
  }

  private recordHistory(offerId: string, changeType: string, previousValue: unknown, nextValue: unknown, reason: string, actor: ActorContext): void {
    this.history.push({
      id: crypto.randomUUID(),
      offerId,
      ...(actor.actorId ? { changedById: actor.actorId } : {}),
      changeType,
      previousValue,
      nextValue,
      reason,
      changedAt: new Date()
    });
  }
}
