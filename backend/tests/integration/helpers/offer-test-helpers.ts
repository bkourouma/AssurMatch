import type { AdminOfferUpsertDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import type { OfferRecord, OffersModule } from "../../../src/modules/offers/offers.module";

export const OFFER_REVIEWER: ActorContext = { actorId: "offer-compliance-reviewer", roles: ["compliance_admin"], mfaVerified: true };

/**
 * Spec 052 FR-004 minimum (insurer, at least one guarantee, source). Fixtures that only care about
 * other fields get these defaults so they can be submitted and validated.
 */
export const COMPLETE_OFFER_DEFAULTS = {
  insurerName: "Assureur partenaire",
  guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
  sourceOfInformation: "Fiche produit transmise par le courtier partenaire"
} as const;

/**
 * Spec 052: an offer is public only once a submitted version has been validated by compliance.
 * Creates the offer (v1 draft), submits it and validates it.
 */
export async function publishOffer(offers: OffersModule, input: AdminOfferUpsertDto, author: ActorContext, reviewer: ActorContext = OFFER_REVIEWER): Promise<OfferRecord> {
  const offer = await offers.adminService.create({ ...COMPLETE_OFFER_DEFAULTS, ...input }, author);
  await offers.adminService.submit(offer.id, "Soumission du jeu de donnees de test", author);
  return offers.adminService.validate(offer.id, { reason: "Validation du jeu de donnees de test" }, reviewer);
}

/** Moves the validity of a published offer into the past (the offer expired after its publication). */
export async function expireOffer(offers: OffersModule, offerId: string, validUntil = new Date("2021-01-01T00:00:00.000Z")): Promise<void> {
  const validFrom = new Date(validUntil.getTime() - 365 * 24 * 60 * 60 * 1000);
  const offer = await offers.repository.require(offerId);
  await offers.repository.update(offerId, { validFrom, validUntil });
  if (offer.publishedVersionId) await offers.repository.updateVersion(offer.publishedVersionId, { validFrom, validUntil });
}
