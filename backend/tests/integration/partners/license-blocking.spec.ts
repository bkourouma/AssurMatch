import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnerEligibilityService } from "../../../src/modules/partners/partner-eligibility.service";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("license blocking", () => {
  it("makes partner ineligible when license is invalid", () => {
    const audit = new AuditLogWriter();
    const partners = new PartnersService(audit);
    const licenses = new PartnerLicensesService(audit);
    const partner = partners.create({ legalName: "Broker CI", primaryEmail: "ops@broker.example", primaryWhatsApp: "+2250102030405", status: "active" }, superAdminActor);
    licenses.create({
      partnerTenantId: partner.id,
      licenseNumber: "LIC-CI-2",
      issuingAuthority: "Regulator",
      countryId: "00000000-0000-4000-8000-000000000030",
      productIds: [],
      status: "invalid",
      effectiveDate: "2026-01-01",
      expirationDate: "2028-01-01"
    }, superAdminActor);

    const result = new PartnerEligibilityService(partners, licenses).evaluate(partner.id, "00000000-0000-4000-8000-000000000030");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("license_not_valid_for_scope");
  });
});
