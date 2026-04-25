import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnerEligibilityService } from "../../../src/modules/partners/partner-eligibility.service";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { RoutingPrecheckService } from "../../../src/modules/routing/routing.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("routing precheck blockers", () => {
  it("returns not eligible when consent and license blockers exist", () => {
    const audit = new AuditLogWriter();
    const partners = new PartnersService(audit);
    const partner = partners.create({ legalName: "Broker", primaryEmail: "ops@broker.example", primaryWhatsApp: "+2250102030405", status: "active" }, superAdminActor);
    const service = new RoutingPrecheckService(new ConsentService(audit), new PartnerEligibilityService(partners, new PartnerLicensesService(audit)), audit);

    const result = service.evaluate(superAdminActor, {
      countryId: "00000000-0000-4000-8000-000000000030",
      productId: "00000000-0000-4000-8000-000000000040",
      partnerTenantId: partner.id
    });

    expect(result.result).toBe("not_eligible");
    expect(result.notifiedBrokers).toBe(false);
  });
});
