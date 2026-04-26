import { describe, expect, it } from "vitest";
import { COUNTRY_FEATURE_FLAG_DEFAULTS, PRODUCT_FEATURE_FLAG_DEFAULTS } from "../../../../packages/shared/contracts/catalog.contracts";
import type { Country } from "../../../src/modules/countries/countries.module";
import { MemoryCountriesRepository } from "../../../src/modules/countries/countries.repository";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";
import { MemoryOffersRepository } from "../../../src/modules/offers/offers.repository";
import type { Product } from "../../../src/modules/products/products.module";
import { MemoryProductsRepository } from "../../../src/modules/products/products.repository";

describe("catalog memory repositories", () => {
  it("stores public countries and products behind repository ports", () => {
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

    countries.create(country);
    products.create(product);

    expect(countries.findByIsoCode("ci")?.id).toBe(country.id);
    expect(countries.listPublic()).toHaveLength(1);
    expect(products.listPublic(country.id)).toEqual([product]);
  });

  it("stores offers and history through the offer repository", () => {
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

    offers.create(offer);
    offers.appendHistory({ id: "history-1", offerId: offer.id, changeType: "created", reason: "test", changedAt: now });

    expect(offers.require(offer.id)).toBe(offer);
    expect(offers.history()).toHaveLength(1);
  });
});
