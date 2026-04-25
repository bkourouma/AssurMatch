import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { DocumentsService } from "../../../src/modules/documents/documents.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("partner compliance workflow", () => {
  it("creates partner, license and accreditation evidence", () => {
    const audit = new AuditLogWriter();
    const partners = new PartnersService(audit);
    const licenses = new PartnerLicensesService(audit);
    const documents = new DocumentsService(audit);
    const partner = partners.create({ legalName: "Broker CI", primaryEmail: "ops@broker.example", primaryWhatsApp: "+2250102030405" }, superAdminActor);
    const license = licenses.create({
      partnerTenantId: partner.id,
      licenseNumber: "LIC-CI-1",
      issuingAuthority: "Regulator",
      countryId: "00000000-0000-4000-8000-000000000030",
      productIds: [],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2028-01-01"
    }, superAdminActor);
    const document = documents.register({
      partnerTenantId: partner.id,
      licenseId: license.id,
      documentType: "license",
      storageKey: "partners/broker-ci/license.pdf",
      checksum: "sha256:test",
      status: "accepted"
    }, superAdminActor);

    expect(document.status).toBe("accepted");
    expect(audit.all().map((entry) => entry.action)).toContain("accreditation_document.registered");
  });
});
