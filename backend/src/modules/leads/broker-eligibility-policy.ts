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
    private readonly activeAssignmentsForPartner: (partnerTenantId: string) => number | Promise<number> = () => 0
  ) {}

  async evaluate(partnerTenantId: string, countryId: string, productId: string): Promise<BrokerEligibilityResult> {
    const partner = await this.partners.require(partnerTenantId);
    const reasons: string[] = [];
    if (partner.status !== "active") reasons.push("partner_not_active");
    if (partner.capacityStatus === "blocked" || partner.capacityStatus === "full") reasons.push("partner_capacity_blocked");
    if (!await this.partners.isAuthorizedForCountry(partnerTenantId, countryId)) reasons.push("partner_country_not_authorized");
    if (!await this.partners.isAuthorizedForProduct(partnerTenantId, productId)) reasons.push("partner_product_not_authorized");
    if (!await this.licenses.eligible(partnerTenantId, countryId, productId)) reasons.push("license_not_valid_for_scope");
    if (partner.quotaMonthlyLeads > 0 && await this.activeAssignmentsForPartner(partnerTenantId) >= partner.quotaMonthlyLeads) reasons.push("partner_quota_exhausted");
    return { partner, eligible: reasons.length === 0, reasons };
  }

  async candidates(countryId: string, productId: string): Promise<BrokerEligibilityResult[]> {
    return Promise.all((await this.partners.list()).map((partner) => this.evaluate(partner.id, countryId, productId)));
  }
}
