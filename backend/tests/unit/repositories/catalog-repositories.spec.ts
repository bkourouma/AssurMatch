import { describe, expect, it } from "vitest";
import { COUNTRY_FEATURE_FLAG_DEFAULTS, PRODUCT_FEATURE_FLAG_DEFAULTS } from "../../../../packages/shared/contracts/catalog.contracts";
import type { Country } from "../../../src/modules/countries/countries.module";
import { MemoryCountriesRepository } from "../../../src/modules/countries/countries.repository";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";
import { MemoryOffersRepository } from "../../../src/modules/offers/offers.repository";
import type { Product } from "../../../src/modules/products/products.module";
import { MemoryProductsRepository } from "../../../src/modules/products/products.repository";

describe("catalog memory repositories", () => {
  it("stores public countries and products behind repository ports", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const countries = new MemoryCountriesRepository();
    const products = new MemoryProductsRepository();
    const country: Country = {
      id: "country-ci",
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "regime-ci",
      status: "public",
      flags: { ...COUNTRY_FEATURE_FLAG_DEFAULTS, country_public_enabled: true },
      createdAt: now,
      updatedAt: now
    };
    const product: Product = {
      id: "product-auto",
      key: "auto",
      name: "Assurance auto",
      sensitivity: "standard",
      requiresDocuments: false,
      requiresManualReview: false,
      status: "public",
      flags: { ...PRODUCT_FEATURE_FLAG_DEFAULTS, product_public_enabled: true },
      countryIds: [country.id],
      createdAt: now,
      updatedAt: now
    };

    await countries.create(country);
    await products.create(product);

    expect((await countries.findByIsoCode("ci"))?.id).toBe(country.id);
    expect(await countries.listPublic()).toHaveLength(1);
    expect(await products.listPublic(country.id)).toEqual([product]);
  });

  it("stores offers and history through the offer repository", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const offers = new MemoryOffersRepository();
    const offer: OfferRecord = {
      id: "offer-auto",
      countryId: "country-ci",
      productId: "product-auto",
      partnerTenantId: "partner-a",
      publicKey: "auto-partner-a",
      name: "Auto Partner A",
      indicativePriceMin: 10000,
      currency: "XOF",
      status: "active",
      validationStatus: "validated",
      validFrom: now,
      validUntil: new Date("2030-01-01T00:00:00.000Z"),
      isSponsored: false,
      displayPriority: 1,
      publicDisclaimers: [],
      createdAt: now,
      updatedAt: now
    };

    await offers.create(offer);
    await offers.appendHistory({ id: "history-1", offerId: offer.id, changeType: "created", reason: "test", changedAt: now });

    expect(await offers.require(offer.id)).toBe(offer);
    expect(await offers.history()).toHaveLength(1);
  });
});
