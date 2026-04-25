import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService, PartnerTenant } from "../partners/partners.module";

export interface BrokerEligibilityResult {
  partner: PartnerTenant;
  eligible: boolean;
  reasons: string[];
}

export class BrokerEligibilityPolicy {
  constructor(
    private readonly partners: PartnersService,
    private readonly licenses: PartnerLicensesService,
    private readonly activeAssignmentsForPartner: (partnerTenantId: string) => number = () => 0
  ) {}

  evaluate(partnerTenantId: string, countryId: string, productId: string): BrokerEligibilityResult {
    const partner = this.partners.require(partnerTenantId);
    const reasons: string[] = [];
    if (partner.status !== "active") reasons.push("partner_not_active");
    if (partner.capacityStatus === "blocked" || partner.capacityStatus === "full") reasons.push("partner_capacity_blocked");
    if (!this.partners.isAuthorizedForCountry(partnerTenantId, countryId)) reasons.push("partner_country_not_authorized");
    if (!this.partners.isAuthorizedForProduct(partnerTenantId, productId)) reasons.push("partner_product_not_authorized");
    if (!this.licenses.eligible(partnerTenantId, countryId, productId)) reasons.push("license_not_valid_for_scope");
    if (partner.quotaMonthlyLeads > 0 && this.activeAssignmentsForPartner(partnerTenantId) >= partner.quotaMonthlyLeads) reasons.push("partner_quota_exhausted");
    return { partner, eligible: reasons.length === 0, reasons };
  }

  candidates(countryId: string, productId: string): BrokerEligibilityResult[] {
    return this.partners.list().map((partner) => this.evaluate(partner.id, countryId, productId));
  }
}
