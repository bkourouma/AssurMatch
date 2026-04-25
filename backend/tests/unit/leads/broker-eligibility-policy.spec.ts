import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { BrokerEligibilityPolicy } from "../../../src/modules/leads/broker-eligibility-policy";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("BrokerEligibilityPolicy", () => {
  it("requires active authorized partner, capacity and valid scoped license", () => {
    const audit = new AuditLogWriter();
    const partners = new PartnersService(audit);
    const licenses = new PartnerLicensesService(audit);
    const countryId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const partner = partners.create({ legalName: "Broker", primaryEmail: "ops@broker.example", primaryWhatsApp: "+2250102030405", status: "active", quotaMonthlyLeads: 1 }, superAdminActor);
    partners.authorizeCountry(partner.id, countryId, superAdminActor);
    partners.authorizeProduct(partner.id, productId, superAdminActor);
    licenses.create({
      partnerTenantId: partner.id,
      licenseNumber: "LIC",
      issuingAuthority: "Regulator",
      countryId,
      productIds: [productId],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01"
    }, superAdminActor);

    expect(new BrokerEligibilityPolicy(partners, licenses).evaluate(partner.id, countryId, productId).eligible).toBe(true);
    expect(new BrokerEligibilityPolicy(partners, licenses, () => 1).evaluate(partner.id, countryId, productId).reasons).toContain("partner_quota_exhausted");
  });
});
