import { describe, expect, it } from "vitest";
import { OfferPublicationPolicy } from "../../../src/modules/offers/offer-publication-policy";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";

function offer(overrides: Partial<OfferRecord> = {}): OfferRecord {
  const now = new Date("2026-04-25T00:00:00.000Z");
  return {
    id: crypto.randomUUID(),
    countryId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    publicKey: "auto-essential",
    name: "Auto Essentiel",
    currency: "XOF",
    status: "active",
    validationStatus: "validated",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2030-01-01T00:00:00.000Z"),
    isSponsored: false,
    displayPriority: 0,
    publicDisclaimers: ["offre indicative", "prix a confirmer"],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("OfferPublicationPolicy", () => {
  it("allows only active validated in-period indicative offers", () => {
    const policy = new OfferPublicationPolicy();

    expect(policy.evaluate(offer()).public).toBe(true);
    expect(policy.evaluate(offer({ validationStatus: "pending" })).reasons).toContain("offer_not_validated");
    expect(policy.evaluate(offer({ status: "suspended" })).reasons).toContain("offer_not_active");
    expect(policy.evaluate(offer({ validUntil: new Date("2024-01-01T00:00:00.000Z") })).reasons).toContain("offer_expired");
    expect(policy.evaluate(offer({ publicDisclaimers: ["prix a confirmer"] })).reasons).toContain("missing_indicative_wording");
  });
});
