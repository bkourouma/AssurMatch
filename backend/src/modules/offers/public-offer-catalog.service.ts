import type { OfferDetail, OfferListQuery, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { offerListQuerySchema } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { OfferPublicationPolicy } from "./offer-publication-policy";
import type { OfferRecord } from "./offers.module";
import { MemoryOffersRepository, type OffersRepository } from "./offers.repository";

export interface PublicOfferVisibilityContext {
  globalFlags?: Partial<Record<string, boolean>>;
  countryFlags?: Partial<Record<string, boolean>>;
  productFlags?: Partial<Record<string, boolean>>;
  resolveCountryFlags?: (countryId: string) => Promise<Partial<Record<string, boolean>> | undefined> | Partial<Record<string, boolean>> | undefined;
  resolveProductFlags?: (productId: string) => Promise<Partial<Record<string, boolean>> | undefined> | Partial<Record<string, boolean>> | undefined;
  evaluatePartnerEligibility?: (partnerTenantId: string, countryId: string, productId: string) => Promise<{ eligible: boolean; reasons: string[] }>;
}

export class PublicOfferCatalogService {
  private readonly policy = new OfferPublicationPolicy();

  private readonly repository: OffersRepository;

  constructor(repositoryOrOffers: OffersRepository | OfferRecord[], private readonly audit: AuditLogWriter) {
    if (Array.isArray(repositoryOrOffers)) {
      const repository = new MemoryOffersRepository();
      for (const offer of repositoryOrOffers) void repository.create(offer);
      this.repository = repository;
    } else {
      this.repository = repositoryOrOffers;
    }
  }

  async list(countryId: string, productId: string, query: Partial<OfferListQuery> = {}, actor?: ActorContext, context?: PublicOfferVisibilityContext): Promise<OfferSummary[]> {
    const parsed = offerListQuerySchema.parse(query);
    const visible: OfferRecord[] = [];
    for (const offer of await this.repository.list()) {
      if (offer.countryId !== countryId || offer.productId !== productId) continue;
      const decision = await this.visibilityDecision(offer, context);
      if (!decision.public) continue;
      if (parsed.minPrice !== undefined && (offer.indicativePriceMin ?? 0) < parsed.minPrice) continue;
      if (parsed.maxPrice !== undefined && (offer.indicativePriceMax ?? offer.indicativePriceMin ?? 0) > parsed.maxPrice) continue;
      if (parsed.broker && offer.partnerTenantId !== parsed.broker) continue;
      visible.push(offer);
    }
    const sorted = this.sort(visible, parsed.sort);
    this.audit.write({
      actor,
      action: QuoteAuditActions.offerPublicListed,
      targetType: "Offer",
      targetId: `${countryId}:${productId}`,
      scope: { countryId, productId },
      result: "success",
      context: { count: sorted.length, sort: parsed.sort }
    });
    return sorted.map((offer) => this.toSummary(offer));
  }

  async detail(offerId: string, actor?: ActorContext, context?: PublicOfferVisibilityContext): Promise<OfferDetail> {
    const offer = (await this.repository.list()).find((candidate) => candidate.id === offerId);
    const decision = offer ? await this.visibilityDecision(offer, context) : { public: false, reasons: ["offer_not_found"] };
    if (!offer || !decision.public) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.offerPublicRefused,
        targetType: "Offer",
        targetId: offerId,
        result: "refused",
        reason: decision.reasons.join(","),
        context: {}
      });
      throw new Error("Offer is not publicly available");
    }
    return {
      ...this.toSummary(offer),
      validUntil: offer.validUntil.toISOString(),
      publicDisclaimers: offer.publicDisclaimers
    };
  }

  private async visibilityDecision(offer: OfferRecord, context?: PublicOfferVisibilityContext) {
    const decision = this.policy.evaluate(offer);
    const reasons = [...decision.reasons];
    if (context) {
      const countryFlags = context.countryFlags ?? await context.resolveCountryFlags?.(offer.countryId);
      const productFlags = context.productFlags ?? await context.resolveProductFlags?.(offer.productId);
      if (context.globalFlags?.public_comparator_enabled !== true) reasons.push("public_comparator_disabled");
      if (countryFlags?.country_public_enabled !== true) reasons.push("country_public_disabled");
      if (countryFlags?.country_comparison_enabled !== true) reasons.push("country_comparison_disabled");
      if (productFlags?.product_public_enabled !== true) reasons.push("product_public_disabled");
      if (productFlags?.product_comparison_enabled !== true) reasons.push("product_comparison_disabled");
      if (offer.isSponsored && context.globalFlags?.sponsored_offers_enabled !== true) reasons.push("sponsored_offers_disabled");
      if (offer.partnerTenantId && context.evaluatePartnerEligibility) {
        const eligibility = await context.evaluatePartnerEligibility(offer.partnerTenantId, offer.countryId, offer.productId);
        if (!eligibility.eligible) reasons.push(...eligibility.reasons);
      }
    }
    return { public: reasons.length === 0, reasons };
  }

  private sort(offers: OfferRecord[], sort: OfferListQuery["sort"]): OfferRecord[] {
    return [...offers].sort((a, b) => {
      if (sort === "price_asc") return (a.indicativePriceMin ?? 0) - (b.indicativePriceMin ?? 0);
      if (sort === "price_desc") return (b.indicativePriceMin ?? 0) - (a.indicativePriceMin ?? 0);
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "sponsored_explicit") return Number(b.isSponsored) - Number(a.isSponsored) || a.name.localeCompare(b.name);
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }

  private toSummary(offer: OfferRecord): OfferSummary {
    return {
      id: offer.id,
      name: offer.name,
      ...(offer.partnerTenantId ? { brokerName: "courtier partenaire" } : {}),
      ...(offer.indicativePriceMin !== undefined ? { indicativePriceMin: offer.indicativePriceMin } : {}),
      ...(offer.indicativePriceMax !== undefined ? { indicativePriceMax: offer.indicativePriceMax } : {}),
      indicativePriceLabel: "prix a confirmer",
      ...(offer.guaranteeSummary ? { guaranteeSummary: offer.guaranteeSummary } : {}),
      isSponsored: offer.isSponsored,
      ...(offer.sponsorLabel ? { sponsorLabel: offer.sponsorLabel } : {}),
      disclaimer: "offre indicative a confirmer par le courtier partenaire"
    };
  }
}
