import { describe, expect, it } from "vitest";
import type { PartnerLicense } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { MemoryPartnerLicensesRepository } from "../../../src/modules/partner-licenses/partner-licenses.repository";
import type { PartnerTenant } from "../../../src/modules/partners/partners.module";
import { MemoryPartnersRepository } from "../../../src/modules/partners/partners.repository";

describe("partner and license memory repositories", () => {
  it("stores partner authorizations and valid license eligibility", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const partners = new MemoryPartnersRepository();
    const licenses = new MemoryPartnerLicensesRepository();
    const partner: PartnerTenant = {
      id: "partner-a",
      legalName: "Broker A",
      plan: "starter",
      status: "active",
      primaryEmail: "broker-a@example.com",
      primaryWhatsApp: "+2250102030405",
      quotaMonthlyLeads: 10,
      capacityStatus: "available",
      createdAt: now,
      updatedAt: now
    };
    const license: PartnerLicense = {
      id: "license-a",
      partnerTenantId: partner.id,
      licenseNumber: "LIC-A",
      issuingAuthority: "Regulator",
      countryId: "country-ci",
      productIds: ["product-auto"],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01",
      createdAt: now,
      updatedAt: now
    };

    partners.create(partner);
    partners.authorizeCountry(partner.id, "country-ci");
    partners.authorizeProduct(partner.id, "product-auto");
    licenses.create(license);

    expect(partners.isAuthorizedForCountry(partner.id, "country-ci")).toBe(true);
    expect(partners.isAuthorizedForProduct(partner.id, "product-auto")).toBe(true);
    expect(licenses.eligible(partner.id, "country-ci", "product-auto")).toBe(true);
    expect(licenses.eligible(partner.id, "country-ci", "product-habitation")).toBe(false);
  });
});
