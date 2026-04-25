import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("license eligibility", () => {
  it("blocks expired or out-of-scope licenses", () => {
    const licenses = new PartnerLicensesService(new AuditLogWriter());
    const license = licenses.create({
      partnerTenantId: "00000000-0000-4000-8000-000000000020",
      licenseNumber: "LIC-001",
      issuingAuthority: "Regulator",
      countryId: "00000000-0000-4000-8000-000000000030",
      productIds: ["00000000-0000-4000-8000-000000000040"],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2027-01-01"
    }, superAdminActor);

    expect(license.status).toBe("valid");
    expect(licenses.eligible(license.partnerTenantId, license.countryId, license.productIds[0])).toBe(true);
    expect(licenses.eligible(license.partnerTenantId, license.countryId, "00000000-0000-4000-8000-000000000041")).toBe(false);
  });
});
