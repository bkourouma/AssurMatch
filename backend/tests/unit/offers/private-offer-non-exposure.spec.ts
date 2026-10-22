import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { OfferPublicationPolicy } from "../../../src/modules/offers/offer-publication-policy";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";
import { MemoryOffersRepository } from "../../../src/modules/offers/offers.repository";
import { PublicOfferCatalogService, type PublicOfferVisibilityContext } from "../../../src/modules/offers/public-offer-catalog.service";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { PublicStatsService } from "../../../src/modules/public-stats/public-stats.module";

const countryId = "00000000-0000-4000-8000-0000000070f1";
const productId = "00000000-0000-4000-8000-0000000070f2";
const partnerTenantId = "00000000-0000-4000-8000-0000000070f3";

/** The most permissive state an offer can reach: validated, active, valid dates, indicative wording. */
function offer(name: string, overrides: Partial<OfferRecord> = {}): OfferRecord {
  return {
    id: crypto.randomUUID(),
    countryId,
    productId,
    partnerTenantId,
    publicKey: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    indicativePriceMin: 10000,
    currency: "XOF",
    status: "active",
    validationStatus: "validated",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2030-01-01T00:00:00.000Z"),
    isSponsored: false,
    displayPriority: 0,
    publicDisclaimers: ["offre indicative", "prix à confirmer par le courtier partenaire"],
    insurerName: "NSIA",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

const openContext: PublicOfferVisibilityContext = {
  globalFlags: { public_comparator_enabled: true, sponsored_offers_enabled: true },
  countryFlags: { country_public_enabled: true, country_comparison_enabled: true },
  productFlags: { product_public_enabled: true, product_comparison_enabled: true },
  evaluatePartnerEligibility: async () => ({ eligible: true, reasons: [] })
};

async function catalogWith(offers: OfferRecord[]) {
  const repository = new MemoryOffersRepository();
  for (const item of offers) await repository.create(item);
  return { repository, catalog: new PublicOfferCatalogService(repository, new AuditLogWriter()) };
}

describe("spec 070 private offers are never public", () => {
  it("the publication policy refuses a private offer in the most permissive state", () => {
    const policy = new OfferPublicationPolicy();
    expect(policy.evaluate(offer("Normale")).public).toBe(true);
    expect(policy.evaluate(offer("Assureur", { offerType: "insurer" })).public).toBe(true);
    expect(policy.evaluate(offer("Partenaire", { offerType: "partner" })).public).toBe(true);
    expect(policy.evaluate(offer("Privee", { offerType: "private" }))).toEqual({ public: false, reasons: ["offer_private"] });
  });

  it("is absent from list, detail, compare, listInsurers and selectableOffer", async () => {
    const publicOne = offer("Auto Publique");
    const publicTwo = offer("Auto Assureur", { offerType: "insurer", insurerName: "Saham" });
    const hidden = offer("Auto Privee", { offerType: "private", insurerName: "Allianz" });
    const { catalog } = await catalogWith([publicOne, publicTwo, hidden]);

    const listed = await catalog.list(countryId, productId, {}, undefined, openContext);
    expect(listed.map((item) => item.id).sort()).toEqual([publicOne.id, publicTwo.id].sort());

    await expect(catalog.detail(hidden.id, undefined, openContext)).rejects.toThrow("not publicly available");
    await expect(catalog.detail(hidden.id)).rejects.toThrow("not publicly available");
    await expect(catalog.compare({ ids: `${publicOne.id},${hidden.id}` }, undefined, openContext)).rejects.toThrow("not publicly available");
    await expect(catalog.compare({ ids: `${publicOne.id},${publicTwo.id}` }, undefined, openContext)).resolves.toMatchObject({ items: [{ id: publicOne.id }, { id: publicTwo.id }] });

    const insurers = await catalog.listInsurers(countryId, openContext);
    expect(insurers.map((item) => item.insurerName).sort()).toEqual(["NSIA", "Saham"]);

    expect(await catalog.selectableOffer(hidden.id, countryId, productId, openContext)).toEqual({ reasons: ["offer_private"] });
    expect(await catalog.selectableOffer(publicTwo.id, countryId, productId, openContext)).toMatchObject({ reasons: [], offer: { id: publicTwo.id } });
  });

  it("is not counted by the public statistics", async () => {
    const { repository } = await catalogWith([offer("Auto Publique"), offer("Auto Privee", { offerType: "private" }), offer("Auto Privee 2", { offerType: "private" })]);
    const audit = new AuditLogWriter();
    const stats = new PublicStatsService(new CountriesService(audit), new PartnersService(audit), new PartnerLicensesService(audit), repository);
    expect((await stats.read()).validatedOffers).toBe(1);
  });

  it("an offer reaching the public state through every other rule is still refused with a precise audit reason", async () => {
    const hidden = offer("Auto Privee", { offerType: "private" });
    const repository = new MemoryOffersRepository();
    await repository.create(hidden);
    const audit = new AuditLogWriter();
    const catalog = new PublicOfferCatalogService(repository, audit);
    await expect(catalog.detail(hidden.id, undefined, openContext)).rejects.toThrow();
    expect(audit.all().find((entry) => entry.action === "offer.public_refused")).toMatchObject({ reason: "offer_private", result: "refused" });
  });
});
