import type { DocumentsService } from "../documents/documents.module";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "./partners.module";

export interface PartnerEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export class PartnerEligibilityService {
  constructor(
    private readonly partners: PartnersService,
    private readonly licenses: PartnerLicensesService,
    private readonly documents?: DocumentsService
  ) {}

  async evaluate(partnerTenantId: string, countryId: string, productId?: string): Promise<PartnerEligibilityResult> {
    const partner = await this.partners.require(partnerTenantId);
    const reasons: string[] = [];
    if (partner.status !== "active") reasons.push("partner_not_active");
    if (partner.capacityStatus === "blocked" || partner.capacityStatus === "full") reasons.push("partner_capacity_blocked");
    if (!await this.partners.isAuthorizedForCountry(partnerTenantId, countryId)) reasons.push("partner_country_not_authorized");
    if (productId && !await this.partners.isAuthorizedForProduct(partnerTenantId, productId)) reasons.push("partner_product_not_authorized");
    if (!await this.licenses.eligible(partnerTenantId, countryId, productId)) reasons.push("license_not_valid_for_scope");
    if (this.documents && !this.documents.acceptedForPartner(partnerTenantId)) reasons.push("accreditation_document_missing");
    return { eligible: reasons.length === 0, reasons };
  }
}
