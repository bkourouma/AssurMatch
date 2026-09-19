import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService, PartnerTenant } from "../partners/partners.module";

export interface BrokerEligibilityResult {
  partner: PartnerTenant;
  eligible: boolean;
  reasons: string[];
}

const BLOCKER_LABELS: Record<string, string> = {
  partner_not_active: "partner_inactive",
  partner_capacity_blocked: "capacity_blocked",
  partner_country_not_authorized: "country_scope_missing",
  partner_product_not_authorized: "product_scope_missing",
  license_not_valid_for_scope: "license_blocked",
  partner_quota_exhausted: "quota_exhausted",
  accreditation_document_missing: "accreditation_missing"
};

/**
 * Error-message safe wording for eligibility blockers. The HTTP error filter classifies
 * responses from message keywords, so the labels avoid "auth"/"invalid" (which would read as
 * 401/400) and keep "license" (422) semantics.
 */
export function describeEligibilityBlockers(reasons: readonly string[]): string {
  return reasons.map((reason) => BLOCKER_LABELS[reason] ?? reason).join(",");
}

export class BrokerEligibilityPolicy {
  constructor(
    private readonly partners: PartnersService,
    private readonly licenses: PartnerLicensesService,
    /** Leads consumed in the current month, compared against `quotaMonthlyLeads`. */
    private readonly monthlyAssignmentsForPartner: (partnerTenantId: string) => number | Promise<number> = () => 0
  ) {}

  async evaluate(partnerTenantId: string, countryId: string, productId: string): Promise<BrokerEligibilityResult> {
    const partner = await this.partners.require(partnerTenantId);
    const reasons: string[] = [];
    if (partner.status !== "active") reasons.push("partner_not_active");
    if (partner.capacityStatus === "blocked" || partner.capacityStatus === "full") reasons.push("partner_capacity_blocked");
    if (!await this.partners.isAuthorizedForCountry(partnerTenantId, countryId)) reasons.push("partner_country_not_authorized");
    if (!await this.partners.isAuthorizedForProduct(partnerTenantId, productId)) reasons.push("partner_product_not_authorized");
    if (!await this.licenses.eligible(partnerTenantId, countryId, productId)) reasons.push("license_not_valid_for_scope");
    if (partner.quotaMonthlyLeads > 0 && await this.monthlyAssignmentsForPartner(partnerTenantId) >= partner.quotaMonthlyLeads) reasons.push("partner_quota_exhausted");
    return { partner, eligible: reasons.length === 0, reasons };
  }

  async candidates(countryId: string, productId: string): Promise<BrokerEligibilityResult[]> {
    return Promise.all((await this.partners.list()).map((partner) => this.evaluate(partner.id, countryId, productId)));
  }
}
