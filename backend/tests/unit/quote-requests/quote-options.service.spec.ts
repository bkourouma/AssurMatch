import { describe, expect, it, vi } from "vitest";
import { QuoteOptionsService, type QuoteOptionsDependencies } from "../../../src/modules/quote-requests/quote-options.service";
import type { Country } from "../../../src/modules/countries/countries.module";
import type { Product } from "../../../src/modules/products/products.module";

const country = { id: "c1", isoCode: "SN" } as unknown as Country;
const product = { id: "p1", key: "auto" } as unknown as Product;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function build(overrides: Partial<QuoteOptionsDependencies> = {}) {
  const deps: QuoteOptionsDependencies = {
    findCountryByCode: () => country,
    findProductByKey: () => product,
    isMultiBrokerEnabled: () => true,
    documentUploadEnabled: () => true,
    verifyOffer: async (offerId) => ({ accepted: true, partnerTenantId: id(900 + Number(offerId.slice(-3))) }),
    partnerName: async (partnerId) => `Broker ${partnerId.slice(-3)}`,
    eligibleBrokers: async () => [],
    quoteJourneyOpen: () => true,
    ...overrides
  };
  return { service: new QuoteOptionsService(deps), deps };
}

describe("QuoteOptionsService", () => {
  it("reports multi-broker closed", async () => {
    const { service } = build({ isMultiBrokerEnabled: () => false });
    const result = await service.options("SN", "auto", undefined);
    expect(result.multiBrokerAvailable).toBe(false);
    expect(result.maxOffers).toBe(3);
  });

  it("omits refused or failing offers without error and ignores invalid uuids", async () => {
    const verifyOffer = vi.fn(async (offerId: string) => {
      if (offerId === id(2)) return { accepted: false as const, reason: "offer_not_public" };
      if (offerId === id(3)) throw new Error("boom");
      return { accepted: true as const };
    });
    const { service } = build({ verifyOffer });
    const result = await service.options("SN", "auto", `not-a-uuid,${id(1)},${id(2)},${id(3)},${id(1)}`);
    expect(result.offers).toEqual([{ offerId: id(1) }]);
    expect(verifyOffer).toHaveBeenCalledTimes(3);
  });

  it("caps at 3 offers and exposes the broker only for accepted offers", async () => {
    const { service } = build();
    const result = await service.options("SN", "auto", [1, 2, 3, 4, 5].map(id).join(","));
    expect(result.offers.map((offer) => offer.offerId)).toEqual([id(1), id(2), id(3)]);
    expect(result.offers[0]).toMatchObject({ partnerId: id(901), partnerName: "Broker 901" });
  });

  it("sorts, dedupes and caps brokers at 50", async () => {
    const many = Array.from({ length: 60 }, (_, n) => ({ id: id(n + 1), displayName: `Broker ${String(n).padStart(2, "0")}` }));
    const { service } = build({ eligibleBrokers: async () => [...many.reverse(), many[0]!] });
    const result = await service.options("SN", "auto", undefined);
    expect(result.brokers).toHaveLength(50);
    expect(result.brokers[0]?.displayName).toBe("Broker 00");
    expect(new Set(result.brokers.map((broker) => broker.id)).size).toBe(50);
  });

  it("refuses unknown country, unknown product and closed journey", async () => {
    await expect(build({ findCountryByCode: () => undefined }).service.options("XX", "auto", undefined)).rejects.toThrow("Quote options are not publicly available");
    await expect(build({ findProductByKey: () => undefined }).service.options("SN", "nope", undefined)).rejects.toThrow("Quote options are not publicly available");
    await expect(build({ quoteJourneyOpen: () => false }).service.options("SN", "auto", undefined)).rejects.toThrow("Quote options are not publicly available");
  });

  it("falls back to documentUploadEnabled=false when the check throws", async () => {
    const { service } = build({ documentUploadEnabled: async () => { throw new Error("down"); } });
    expect((await service.options("SN", "auto", undefined)).documentUploadEnabled).toBe(false);
  });

  it("returns no personal field", async () => {
    const { service } = build({ eligibleBrokers: async () => [{ id: id(7), displayName: "Alpha" }] });
    const result = await service.options("SN", "auto", id(1));
    expect(Object.keys(result).sort()).toEqual(["brokers", "documentUploadEnabled", "maxOffers", "multiBrokerAvailable", "offers"]);
    expect(JSON.stringify(result)).not.toMatch(/email|phone|token|ip/i);
  });
});
