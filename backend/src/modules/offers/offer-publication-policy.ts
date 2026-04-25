import type { OfferRecord } from "./offers.module";

export interface OfferPublicationDecision {
  public: boolean;
  reasons: string[];
}

export class OfferPublicationPolicy {
  evaluate(offer: OfferRecord, now = new Date()): OfferPublicationDecision {
    const reasons: string[] = [];
    if (offer.status !== "active" && offer.status !== "validated") reasons.push("offer_not_active");
    if (offer.validationStatus !== "validated") reasons.push("offer_not_validated");
    if (offer.validFrom > now) reasons.push("offer_not_started");
    if (offer.validUntil <= now) reasons.push("offer_expired");
    if (!offer.publicDisclaimers.some((item) => item.includes("offre indicative"))) reasons.push("missing_indicative_wording");
    return { public: reasons.length === 0, reasons };
  }
}
