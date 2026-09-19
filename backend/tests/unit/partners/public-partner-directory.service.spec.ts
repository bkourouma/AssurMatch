import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { PublicPartnerDirectoryService } from "../../../src/modules/partners/public-partner-directory.service";
import { ProductsService } from "../../../src/modules/products/products.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const FORBIDDEN_FIELDS = [
  "primaryEmail",
  "primaryWhatsApp",
  "plan",
  "quotaMonthlyLeads",
  "capacityStatus",
  "suspensionReason",
  "registrationNumber"
];

function dateOnly(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function setupOpenCountryWithProduct() {
  const audit = new AuditLogWriter();
  const countries = new CountriesService(audit);
  const products = new ProductsService(audit);
  const partners = new PartnersService(audit);
  const licenses = new PartnerLicensesService(audit);
  const service = new PublicPartnerDirectoryService(partners, licenses, countries, products, new InMemoryRedisClient(), audit);

  const country = await countries.create(
    {
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      status: "public",
      flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true }
    },
    superAdminActor
  );
  const product = await products.create(
    {
      key: "auto",
      name: "Assurance auto",
      sensitivity: "standard",
      status: "public",
      flags: { product_public_enabled: true, product_comparison_enabled: true, product_quote_enabled: true }
    },
    superAdminActor
  );
  await products.associateCountry(product.id, country.id, superAdminActor);

  return { audit, countries, products, partners, licenses, service, country, product };
}

async function createEligiblePartner(
  ctx: Awaited<ReturnType<typeof setupOpenCountryWithProduct>>,
  overrides: { name: string; licenseExpiresInDays?: number; licenseStatus?: "valid" | "expired"; status?: "active" | "suspended"; authorizeCountry?: boolean; authorizeProduct?: boolean }
) {
  const partner = await ctx.partners.create(
    {
      legalName: overrides.name,
      status: overrides.status ?? "active",
      primaryEmail: `${overrides.name.toLowerCase().replace(/\s+/g, "-")}@broker.example`,
      primaryWhatsApp: "+2250102030405"
    },
    superAdminActor
  );
  if (overrides.authorizeCountry !== false) await ctx.partners.authorizeCountry(partner.id, ctx.country.id, superAdminActor);
  if (overrides.authorizeProduct !== false) await ctx.partners.authorizeProduct(partner.id, ctx.product.id, superAdminActor);
  await ctx.licenses.create(
    {
      partnerTenantId: partner.id,
      licenseNumber: `LIC-${overrides.name}`,
      issuingAuthority: "CIMA",
      countryId: ctx.country.id,
      productIds: [],
      status: overrides.licenseStatus ?? "valid",
      effectiveDate: dateOnly(-365),
      expirationDate: dateOnly(overrides.licenseExpiresInDays ?? 365)
    },
    superAdminActor
  );
  return partner;
}

describe("PublicPartnerDirectoryService", () => {
  it("lists an eligible partner with the exact public field list and no forbidden fields", async () => {
    const ctx = await setupOpenCountryWithProduct();
    await createEligiblePartner(ctx, { name: "Broker Eligible" });

    const items = await ctx.service.list("CI");
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.displayName).toBe("Broker Eligible");
    expect(item.productKeys).toEqual(["auto"]);
    expect(Object.keys(item).sort()).toEqual(["city", "displayName", "id", "issuingAuthority", "licenseExpiresAt", "licenseNumber", "productKeys"].sort());
    for (const field of FORBIDDEN_FIELDS) {
      expect(Object.keys(item)).not.toContain(field);
    }
  });

  it("excludes a partner whose only licence expired yesterday, and its detail is a 404", async () => {
    const ctx = await setupOpenCountryWithProduct();
    const expired = await createEligiblePartner(ctx, { name: "Broker Expired", licenseExpiresInDays: -1 });

    const items = await ctx.service.list("CI");
    expect(items.map((item) => item.displayName)).not.toContain("Broker Expired");
    await expect(ctx.service.detail("CI", expired.id)).rejects.toThrow(/not found/i);
  });

  it("excludes a suspended tenant even with a valid licence", async () => {
    const ctx = await setupOpenCountryWithProduct();
    await createEligiblePartner(ctx, { name: "Broker Suspended", status: "suspended" });

    const items = await ctx.service.list("CI");
    expect(items.map((item) => item.displayName)).not.toContain("Broker Suspended");
  });

  it("excludes a partner without a country authorization", async () => {
    const ctx = await setupOpenCountryWithProduct();
    await createEligiblePartner(ctx, { name: "Broker Unauthorized", authorizeCountry: false });

    const items = await ctx.service.list("CI");
    expect(items.map((item) => item.displayName)).not.toContain("Broker Unauthorized");
  });

  it("refuses to list when the country is not publicly enabled", async () => {
    const audit = new AuditLogWriter();
    const countries = new CountriesService(audit);
    const products = new ProductsService(audit);
    const partners = new PartnersService(audit);
    const licenses = new PartnerLicensesService(audit);
    const service = new PublicPartnerDirectoryService(partners, licenses, countries, products, new InMemoryRedisClient(), audit);
    await countries.create(
      {
        isoCode: "SN",
        name: "Senegal",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Dakar",
        regulatoryFamily: "cima",
        status: "internal",
        flags: { country_public_enabled: false }
      },
      superAdminActor
    );

    await expect(service.list("SN")).rejects.toThrow(/not publicly available/i);
  });

  it("returns the eligible partner's products and a French disclaimer on detail", async () => {
    const ctx = await setupOpenCountryWithProduct();
    const partner = await createEligiblePartner(ctx, { name: "Broker Detail" });

    const detail = await ctx.service.detail("CI", partner.id);
    expect(detail.products).toEqual([{ key: "auto", name: "Assurance auto" }]);
    expect(detail.disclaimer.length).toBeGreaterThan(0);
    for (const field of FORBIDDEN_FIELDS) {
      expect(Object.keys(detail)).not.toContain(field);
    }
  });
});
