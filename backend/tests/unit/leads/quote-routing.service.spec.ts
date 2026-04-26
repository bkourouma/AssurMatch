import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BrokerEligibilityPolicy } from "../../../src/modules/leads/broker-eligibility-policy";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import { QuoteRoutingService } from "../../../src/modules/leads/quote-routing.service";
import { RoutingDecisionService } from "../../../src/modules/leads/routing-decision.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("QuoteRoutingService", () => {
  it("selects a single eligible broker and ignores sponsorship semantics", async () => {
    const audit = new AuditLogWriter();
    const partners = new PartnersService(audit);
    const licenses = new PartnerLicensesService(audit);
    const countryId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const partner = await partners.create({ legalName: "Broker A", primaryEmail: "a@broker.example", primaryWhatsApp: "+2250102030405", status: "active" }, superAdminActor);
    await partners.authorizeCountry(partner.id, countryId, superAdminActor);
    await partners.authorizeProduct(partner.id, productId, superAdminActor);
    await licenses.create({ partnerTenantId: partner.id, licenseNumber: "LIC", issuingAuthority: "Regulator", countryId, productIds: [productId], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, superAdminActor);
    const assignments = new LeadAssignmentService(audit);
    const service = new QuoteRoutingService(
      new BrokerEligibilityPolicy(partners, licenses, (partnerTenantId) => assignments.activeCountForPartner(partnerTenantId)),
      new RoutingDecisionService(audit),
      assignments,
      audit
    );

    const result = await service.route({ id: crypto.randomUUID(), countryId, productId, consentRecordId: crypto.randomUUID(), status: "created", routingStatus: "not_started" }, superAdminActor);

    expect(result.routingStatus).toBe("assigned");
    expect(await assignments.list()).toHaveLength(1);
  });

  it("blocks routing when consent is missing", async () => {
    const audit = new AuditLogWriter();
    const result = new QuoteRoutingService(
      new BrokerEligibilityPolicy(new PartnersService(audit), new PartnerLicensesService(audit)),
      new RoutingDecisionService(audit),
      new LeadAssignmentService(audit),
      audit
    ).route({ id: crypto.randomUUID(), countryId: crypto.randomUUID(), productId: crypto.randomUUID(), consentRecordId: "", status: "created", routingStatus: "not_started" }, superAdminActor);

    expect((await result).routingStatus).toBe("blocked");
    expect((await result).reasons).toContain("consent_missing");
  });
});
