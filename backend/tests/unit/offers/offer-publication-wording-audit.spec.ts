import { describe, expect, it } from "vitest";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import { OfferPublicationPolicy } from "../../../src/modules/offers/offer-publication-policy";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";

function offer(overrides: Partial<OfferRecord> = {}): OfferRecord {
  const now = new Date("2026-04-25T00:00:00.000Z");
  return {
    id: crypto.randomUUID(), countryId: crypto.randomUUID(), productId: crypto.randomUUID(), publicKey: "auto", name: "Auto Essentiel", currency: "XOF",
    status: "active", validationStatus: "validated", validFrom: new Date("2026-01-01T00:00:00.000Z"), validUntil: new Date("2030-01-01T00:00:00.000Z"),
    isSponsored: false, displayPriority: 0, publicDisclaimers: ["offre indicative"], createdAt: now, updatedAt: now, ...overrides
  };
}

function spyAudit() {
  const entries: Array<Record<string, unknown>> = [];
  return { entries, writer: { write: (input: never) => { entries.push(input); return input; } } as never };
}

describe("OfferPublicationPolicy forbidden_wording audit", () => {
  it("keeps a promise phrase publishable (narrow list) and writes nothing", () => {
    const { entries, writer } = spyAudit();
    const policy = new OfferPublicationPolicy(writer);
    const decision = policy.evaluate(offer({ shortDescription: "Couverture garantie en cas de vol, contrat valide jusqu'au 31/12" }));
    expect(decision).toEqual({ public: true, reasons: [] });
    expect(entries).toHaveLength(0);
  });

  it("masks and journals once per offer version, again after the version changes", () => {
    const { entries, writer } = spyAudit();
    const policy = new OfferPublicationPolicy(writer);
    const hidden = offer({ shortDescription: "Contrat-validé", publishedVersionId: "v1" });
    for (let i = 0; i < 5; i += 1) expect(policy.evaluate(hidden).reasons).toContain("forbidden_wording");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: QuoteAuditActions.offerHiddenForbiddenWording, targetType: "Offer", targetId: hidden.id, result: "refused", reason: "forbidden_wording",
      context: { offerId: hidden.id, versionId: "v1", wording: ["contrat valide"] }
    });
    // Fixed then masked again: a new entry. A new version while masked: a new entry.
    expect(policy.evaluate({ ...hidden, shortDescription: "Texte neutre" }).public).toBe(true);
    policy.evaluate(hidden);
    expect(entries).toHaveLength(2);
    policy.evaluate({ ...hidden, publishedVersionId: "v2" });
    expect(entries).toHaveLength(3);
  });

  it("does not write without a writer, and never throws if the writer does", () => {
    const hidden = offer({ shortDescription: "Buy now" });
    expect(new OfferPublicationPolicy().evaluate(hidden).reasons).toContain("forbidden_wording");
    const policy = new OfferPublicationPolicy({ write: () => { throw new Error("down"); } });
    expect(policy.evaluate(hidden).reasons).toContain("forbidden_wording");
  });
});
