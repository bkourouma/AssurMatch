import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PublicOfferCatalogService } from "../../../src/modules/offers/public-offer-catalog.service";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";

function offer(name: string, price: number, overrides: Partial<OfferRecord> = {}): OfferRecord {
  const countryId = overrides.countryId ?? "00000000-0000-4000-8000-000000000030";
  const productId = overrides.productId ?? "00000000-0000-4000-8000-000000000040";
  return {
    id: crypto.randomUUID(),
    countryId,
    productId,
    publicKey: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    indicativePriceMin: price,
    currency: "XOF",
    status: "active",
    validationStatus: "validated",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2030-01-01T00:00:00.000Z"),
    isSponsored: false,
    displayPriority: 0,
    publicDisclaimers: ["offre indicative"],
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("PublicOfferCatalogService", () => {
  it("filters hidden offers and sorts without recommendation wording", async () => {
    const countryId = "00000000-0000-4000-8000-000000000030";
    const productId = "00000000-0000-4000-8000-000000000040";
    const service = new PublicOfferCatalogService([
      offer("Auto B", 20000, { countryId, productId }),
      offer("Auto A", 10000, { countryId, productId }),
      offer("Expired", 1, { countryId, productId, validUntil: new Date("2024-01-01T00:00:00.000Z") })
    ], new AuditLogWriter());

    const items = await service.list(countryId, productId, { sort: "price_asc" });
    expect(items.map((item) => item.name)).toEqual(["Auto A", "Auto B"]);
    expect(items.map((item) => item.disclaimer).join(" ")).not.toContain("meilleure");
  });

  it("requires activation flags, sponsor flag and partner eligibility when context is provided", async () => {
    const countryId = "00000000-0000-4000-8000-000000000030";
    const productId = "00000000-0000-4000-8000-000000000040";
    const partnerTenantId = "00000000-0000-4000-8000-000000000050";
    const service = new PublicOfferCatalogService([
      offer("Eligible", 10000, { countryId, productId, partnerTenantId }),
      offer("Sponsored", 12000, { countryId, productId, partnerTenantId, isSponsored: true }),
      offer("Unlicensed", 13000, { countryId, productId, partnerTenantId: "00000000-0000-4000-8000-000000000051" })
    ], new AuditLogWriter());
    const context = {
      globalFlags: { public_comparator_enabled: true, sponsored_offers_enabled: false },
      countryFlags: { country_public_enabled: true, country_comparison_enabled: true },
      productFlags: { product_public_enabled: true, product_comparison_enabled: true },
      evaluatePartnerEligibility: async (tenantId: string) => ({
        eligible: tenantId === partnerTenantId,
        reasons: tenantId === partnerTenantId ? [] : ["license_not_valid_for_scope"]
      })
    };

    const items = await service.list(countryId, productId, {}, undefined, context);

    expect(items.map((item) => item.name)).toEqual(["Eligible"]);
    await expect(service.detail(items[0]?.id ?? "", undefined, {
      ...context,
      globalFlags: { public_comparator_enabled: false, sponsored_offers_enabled: false }
    })).rejects.toThrow("Offer is not publicly available");
  });
});
