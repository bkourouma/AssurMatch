import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../../../src/modules/audit-logs/public-site-audit-actions";
import { PublicOfferCatalogService } from "../../../src/modules/offers/public-offer-catalog.service";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";

const countryId = "00000000-0000-4000-8000-000000000030";
const autoProductId = "00000000-0000-4000-8000-000000000040";
const homeProductId = "00000000-0000-4000-8000-000000000041";

function offer(name: string, overrides: Partial<OfferRecord> = {}): OfferRecord {
  return {
    id: crypto.randomUUID(),
    countryId,
    productId: autoProductId,
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
    publicDisclaimers: ["offre indicative"],
    insurerName: "Saham Assurance",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("PublicOfferCatalogService.listInsurers", () => {
  it("excludes an expired offer, a non-validated offer, and an offer for a disabled product from the counts", async () => {
    const audit = new AuditLogWriter();
    const service = new PublicOfferCatalogService([
      offer("Auto Saham", { insurerName: "Saham Assurance" }),
      offer("Auto Saham Expired", { insurerName: "Saham Assurance", validUntil: new Date("2024-01-01T00:00:00.000Z") }),
      offer("Auto Saham Draft", { insurerName: "Saham Assurance", validationStatus: "pending" }),
      offer("Home Saham Disabled Product", { insurerName: "Saham Assurance", productId: homeProductId })
    ], audit);

    const context = {
      globalFlags: { public_comparator_enabled: true },
      countryFlags: { country_public_enabled: true, country_comparison_enabled: true },
      resolveProductFlags: async (productId: string) =>
        productId === autoProductId
          ? { product_public_enabled: true, product_comparison_enabled: true }
          : { product_public_enabled: false, product_comparison_enabled: false }
    };

    const items = await service.listInsurers(countryId, context);

    expect(items).toEqual([{ insurerName: "Saham Assurance", offerCount: 1, productKeys: [autoProductId] }]);
  });

  it("groups two offers of the same insurer into one row with offerCount 2, sorted by count then name", async () => {
    const audit = new AuditLogWriter();
    const service = new PublicOfferCatalogService([
      offer("Auto Saham 1", { insurerName: "Saham Assurance" }),
      offer("Auto Saham 2", { insurerName: "Saham Assurance", productId: homeProductId }),
      offer("Auto Nsia", { insurerName: "NSIA Assurances" })
    ], audit);

    const context = {
      globalFlags: { public_comparator_enabled: true },
      countryFlags: { country_public_enabled: true, country_comparison_enabled: true },
      productFlags: { product_public_enabled: true, product_comparison_enabled: true }
    };

    const items = await service.listInsurers(countryId, context);

    expect(items).toEqual([
      { insurerName: "Saham Assurance", offerCount: 2, productKeys: [autoProductId, homeProductId].sort() },
      { insurerName: "NSIA Assurances", offerCount: 1, productKeys: [autoProductId] }
    ]);
  });

  it("orders insurers with equal offerCount alphabetically by name", async () => {
    const audit = new AuditLogWriter();
    const service = new PublicOfferCatalogService([
      offer("Auto Zenith", { insurerName: "Zenith Assurances" }),
      offer("Auto Allianz", { insurerName: "Allianz" })
    ], audit);

    const items = await service.listInsurers(countryId);

    expect(items.map((item) => item.insurerName)).toEqual(["Allianz", "Zenith Assurances"]);
  });

  it("skips an offer with an empty or blank insurer name", async () => {
    const audit = new AuditLogWriter();
    const service = new PublicOfferCatalogService([
      offer("No Insurer", { insurerName: "" }),
      offer("Blank Insurer", { insurerName: "   " }),
      offer("Real Insurer", { insurerName: "Saham Assurance" })
    ], audit);

    const items = await service.listInsurers(countryId);

    expect(items).toEqual([{ insurerName: "Saham Assurance", offerCount: 1, productKeys: [autoProductId] }]);
  });

  it("writes an audit row for the listing", async () => {
    const audit = new AuditLogWriter();
    const service = new PublicOfferCatalogService([offer("Auto Saham")], audit);

    await service.listInsurers(countryId);

    const entries = audit.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.publicInsurersListed });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.result).toBe("success");
    expect(entries[0]?.context).toMatchObject({ count: 1 });
  });
});
