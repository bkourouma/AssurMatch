import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnerEligibilityService } from "../../../src/modules/partners/partner-eligibility.service";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { RoutingPrecheckService } from "../../../src/modules/routing/routing.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("non-transmissive routing precheck", () => {
  it("does not notify brokers or transmit leads", () => {
    const audit = new AuditLogWriter();
    const partners = new PartnersService(audit);
    const partner = partners.create({ legalName: "Broker", primaryEmail: "ops@broker.example", primaryWhatsApp: "+2250102030405", status: "active" }, superAdminActor);
    const result = new RoutingPrecheckService(
      new ConsentService(audit),
      new PartnerEligibilityService(partners, new PartnerLicensesService(audit)),
      audit
    ).evaluate(superAdminActor, {
      countryId: "00000000-0000-4000-8000-000000000030",
      productId: "00000000-0000-4000-8000-000000000040",
      partnerTenantId: partner.id
    });

    expect(result.transmittedLead).toBe(false);
    expect(result.notifiedBrokers).toBe(false);
  });
});
