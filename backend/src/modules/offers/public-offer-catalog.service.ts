import type { OfferDetail, OfferListQuery, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { offerListQuerySchema } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { OfferPublicationPolicy } from "./offer-publication-policy";
import type { OfferRecord } from "./offers.module";

export class PublicOfferCatalogService {
  private readonly policy = new OfferPublicationPolicy();

  constructor(private readonly offers: OfferRecord[], private readonly audit: AuditLogWriter) {}

  list(countryId: string, productId: string, query: Partial<OfferListQuery> = {}, actor?: ActorContext): OfferSummary[] {
    const parsed = offerListQuerySchema.parse(query);
    const visible = this.offers
      .filter((offer) => offer.countryId === countryId && offer.productId === productId)
      .filter((offer) => this.policy.evaluate(offer).public)
      .filter((offer) => parsed.minPrice === undefined || (offer.indicativePriceMin ?? 0) >= parsed.minPrice)
      .filter((offer) => parsed.maxPrice === undefined || (offer.indicativePriceMax ?? offer.indicativePriceMin ?? 0) <= parsed.maxPrice)
      .filter((offer) => !parsed.broker || offer.partnerTenantId === parsed.broker);
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

  detail(offerId: string, actor?: ActorContext): OfferDetail {
    const offer = this.offers.find((candidate) => candidate.id === offerId);
    const decision = offer ? this.policy.evaluate(offer) : { public: false, reasons: ["offer_not_found"] };
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
