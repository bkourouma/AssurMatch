import { describe, expect, it } from "vitest";
import {
  OFFER_COMPLETENESS_REQUIRED,
  adminOfferContentSchema,
  brokerOfferCreateSchema,
  hasIndicativeDisclaimer,
  offerCompleteness,
  offerContentSchema
} from "../../../../packages/shared/contracts/offer-content";
import { adminOfferUpsertSchema } from "../../../../packages/shared/contracts/quote.contracts";

const base = {
  name: "Auto Essentiel",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z"
};
const now = new Date("2026-10-03T00:00:00.000Z");

describe("spec 052 offer content (shared)", () => {
  it("lists every missing minimum field and scores the PRD fields deterministically", () => {
    const empty = offerCompleteness({ name: " ", validUntil: "2020-01-01T00:00:00.000Z" }, now);
    expect(empty.complete).toBe(false);
    expect(empty.missing).toEqual([...OFFER_COMPLETENESS_REQUIRED]);

    const minimal = offerCompleteness({
      name: "Auto",
      insurerName: "NSIA",
      guarantees: [{ key: "rc", label: "RC", included: true }],
      indicativePriceMax: 20000,
      currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      sourceOfInformation: "Fiche produit"
    }, now);
    expect(minimal).toMatchObject({ complete: true, missing: [] });
    expect(minimal.score).toBeGreaterThan(0);
    expect(minimal.score).toBeLessThan(100);
    // Same input, same score.
    expect(offerCompleteness({ name: "Auto", insurerName: "NSIA" }, now).score).toBe(offerCompleteness({ name: "Auto", insurerName: "NSIA" }, now).score);
  });

  it("refuses a past end of validity as incomplete", () => {
    expect(offerCompleteness({ name: "Auto", validUntil: "2026-10-02T00:00:00.000Z" }, now).missing).toContain("validUntil");
  });

  it("refuses forbidden wording on every text field, inverted prices and inverted dates", () => {
    for (const field of ["name", "shortDescription", "exclusionsSummary", "sourceOfInformation", "insurerName"]) {
      const parsed = offerContentSchema.safeParse({ ...base, [field]: "Souscrire maintenant chez nous" });
      expect(parsed.success, field).toBe(false);
      expect(JSON.stringify(parsed.error?.issues)).toContain("souscrire maintenant");
    }
    expect(offerContentSchema.safeParse({ ...base, guarantees: [{ key: "x", label: "Garantie acceptee", included: true }] }).success).toBe(false);
    expect(offerContentSchema.safeParse({ ...base, indicativePriceMin: 20000, indicativePriceMax: 10000 }).success).toBe(false);
    expect(offerContentSchema.safeParse({ ...base, validUntil: base.validFrom }).success).toBe(false);
    expect(adminOfferUpsertSchema.safeParse({ ...base, countryId: crypto.randomUUID(), productId: crypto.randomUUID(), indicativePriceMin: 5, indicativePriceMax: 1, reason: "price order check" }).success).toBe(false);
  });

  it("caps guarantees at 50 and keeps the indicative mentions by default", () => {
    const guarantees = Array.from({ length: 51 }, (_, index) => ({ key: `g${index}`, label: `G${index}`, included: true }));
    expect(offerContentSchema.safeParse({ ...base, guarantees }).success).toBe(false);
    const parsed = offerContentSchema.parse(base);
    expect(hasIndicativeDisclaimer(parsed.publicDisclaimers)).toBe(true);
  });

  it("keeps sponsorship out of the broker schema and in the admin schema", () => {
    expect(brokerOfferCreateSchema.safeParse({ ...base, countryId: crypto.randomUUID(), productId: crypto.randomUUID(), isSponsored: true }).success).toBe(false);
    expect(offerContentSchema.safeParse({ ...base, displayPriority: 5 }).success).toBe(false);
    expect(adminOfferContentSchema.parse({ ...base, isSponsored: true, sponsorLabel: "Sponsorise" })).toMatchObject({ isSponsored: true });
  });
});
