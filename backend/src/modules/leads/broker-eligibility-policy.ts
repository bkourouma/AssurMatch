import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService, PartnerTenant } from "../partners/partners.module";
import type { PartnerCommercialStatePort, PartnerContractRecordedPort } from "../routing/routing-controls.ports";

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
  accreditation_document_missing: "accreditation_missing",
  // Lot 5 (spec 071): controls 11 (plan status) and 9 (contract recorded and not expired).
  subscription_inactive: "subscription_inactive",
  contract_missing: "contract_missing",
  contract_expired: "contract_expired"
};

/**
 * Lot 5 (spec 071): optional collaborators of the PRD 17 controls 9 and 11. Each absent port skips
 * its control, so policies built by hand (unit tests, legacy callers) keep their scope.
 */
export interface BrokerEligibilityControls {
  /** Control 11 + contract expiry of control 9 (`PartnerSubscription`; no row = active). */
  commercialState?: PartnerCommercialStatePort | undefined;
  /** Control 9: at least one partnership contract recorded for the broker. */
  contractRecorded?: PartnerContractRecordedPort | undefined;
  now?: (() => Date) | undefined;
}

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
    private readonly monthlyAssignmentsForPartner: (partnerTenantId: string) => number | Promise<number> = () => 0,
    /**
     * Spec 051 R14: at least one persisted accreditation document, accepted and clean. Optional so
     * unit tests that build the policy by hand keep their scope; the runtime always provides it.
     */
    private readonly hasAcceptedAccreditation?: (partnerTenantId: string) => Promise<boolean>,
    private readonly controls: BrokerEligibilityControls = {}
  ) {}

  async evaluate(partnerTenantId: string, countryId: string, productId: string): Promise<BrokerEligibilityResult> {
    const partner = await this.partners.require(partnerTenantId);
    const reasons: string[] = [];
    // Spec 051 R1: only `active` (Actif public) is routable; `active_test`, suspended and retired never are.
    if (partner.status !== "active") reasons.push("partner_not_active");
    if (partner.capacityStatus === "blocked" || partner.capacityStatus === "full") reasons.push("partner_capacity_blocked");
    if (!await this.partners.isAuthorizedForCountry(partnerTenantId, countryId)) reasons.push("partner_country_not_authorized");
    if (!await this.partners.isAuthorizedForProduct(partnerTenantId, productId)) reasons.push("partner_product_not_authorized");
    if (!await this.licenses.eligible(partnerTenantId, countryId, productId)) reasons.push("license_not_valid_for_scope");
    if (this.hasAcceptedAccreditation && !await this.hasAcceptedAccreditation(partnerTenantId)) reasons.push("accreditation_document_missing");
    reasons.push(...await this.commercialBlockers(partnerTenantId));
    if (partner.quotaMonthlyLeads > 0 && await this.monthlyAssignmentsForPartner(partnerTenantId) >= partner.quotaMonthlyLeads) reasons.push("partner_quota_exhausted");
    return { partner, eligible: reasons.length === 0, reasons };
  }

  /** Controls 11 and 9 (PRD 17): suspended/cancelled subscription, missing or expired contract. */
  private async commercialBlockers(partnerTenantId: string): Promise<string[]> {
    const reasons: string[] = [];
    if (this.controls.commercialState) {
      const state = await this.controls.commercialState(partnerTenantId);
      if (state.subscriptionStatus === "suspended" || state.subscriptionStatus === "cancelled") reasons.push("subscription_inactive");
      const expiresAt = state.contractExpiresAt ? new Date(state.contractExpiresAt) : undefined;
      if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= (this.controls.now?.() ?? new Date()).getTime()) reasons.push("contract_expired");
    }
    if (this.controls.contractRecorded && !await this.controls.contractRecorded(partnerTenantId)) reasons.push("contract_missing");
    return reasons;
  }

  /**
   * Lot 5 (spec 071, ROUTE-003): quota re-check under the routing lock. The quota is the only blocker
   * a concurrent routing can change between the evaluation and the assignment.
   */
  async recheckQuota(result: BrokerEligibilityResult): Promise<BrokerEligibilityResult> {
    const { partner } = result;
    if (partner.quotaMonthlyLeads <= 0 || result.reasons.includes("partner_quota_exhausted")) return result;
    if (await this.monthlyAssignmentsForPartner(partner.id) < partner.quotaMonthlyLeads) return result;
    return { partner, eligible: false, reasons: [...result.reasons, "partner_quota_exhausted"] };
  }

  async candidates(countryId: string, productId: string): Promise<BrokerEligibilityResult[]> {
    return Promise.all((await this.partners.list()).map((partner) => this.evaluate(partner.id, countryId, productId)));
  }
}
