import { findOfferContentForbiddenWording } from "../../../../packages/shared/contracts/offer-content";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { OfferRecord } from "./offers.module";

export interface OfferPublicationDecision {
  public: boolean;
  reasons: string[];
}

/** Upper bound of the in-memory "already audited" map (one entry per currently masked offer). */
const MAX_TRACKED_MASKED_OFFERS = 5000;

export class OfferPublicationPolicy {
  /** offerId -> token of the offer version already audited while it stays masked. */
  private readonly auditedMasked = new Map<string, string>();

  /**
   * `audit` is optional: callers without a writer (statistics, activation checklist, tests) evaluate the
   * policy without any side effect. With one, hiding a published offer for `forbidden_wording` is journaled.
   */
  constructor(private readonly audit?: Pick<AuditLogWriter, "write">) {}

  evaluate(offer: OfferRecord, now = new Date()): OfferPublicationDecision {
    const reasons: string[] = [];
    // Spec 070 (PRD 13): a private offer belongs to its broker only, whatever its validation state.
    if (offer.offerType === "private") reasons.push("offer_private");
    if (offer.status !== "active" && offer.status !== "validated") reasons.push("offer_not_active");
    if (offer.validationStatus !== "validated") reasons.push("offer_not_validated");
    if (offer.validFrom > now) reasons.push("offer_not_started");
    if (offer.validUntil <= now) reasons.push("offer_expired");
    if (!offer.publicDisclaimers.some((item) => item.includes("offre indicative"))) reasons.push("missing_indicative_wording");
    // A stored offer carrying a regulated expression is never shown to the public (narrow regulated list).
    const wording = findOfferContentForbiddenWording(offer);
    if (wording.length > 0) {
      reasons.push("forbidden_wording");
      this.auditMasked(offer, wording);
    } else {
      this.auditedMasked.delete(offer.id);
    }
    return { public: reasons.length === 0, reasons };
  }

  /** One journal entry per offer version while it stays masked (the public catalogue evaluates on every request). */
  private auditMasked(offer: OfferRecord, wording: string[]): void {
    if (!this.audit) return;
    const token = `${offer.publishedVersionId ?? ""}|${offer.updatedAt.getTime()}`;
    if (this.auditedMasked.get(offer.id) === token) return;
    if (this.auditedMasked.size >= MAX_TRACKED_MASKED_OFFERS) {
      const oldest = this.auditedMasked.keys().next();
      if (!oldest.done) this.auditedMasked.delete(oldest.value);
    }
    this.auditedMasked.set(offer.id, token);
    try {
      // No personal data: identifiers, canonical wording and the reason only.
      this.audit.write({
        action: QuoteAuditActions.offerHiddenForbiddenWording,
        targetType: "Offer",
        targetId: offer.id,
        scope: { countryId: offer.countryId, productId: offer.productId },
        result: "refused",
        reason: "forbidden_wording",
        context: { offerId: offer.id, versionId: offer.publishedVersionId, wording }
      });
    } catch {
      // The journal never breaks a public read.
    }
  }
}
