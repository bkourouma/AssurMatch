import type { PartnerLicenseDto } from "../../../../packages/shared/contracts/partner.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { PartnerLicensesService, type PartnerLicense } from "./partner-licenses.module";

export class PartnerLicensesController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly licenses: PartnerLicensesService) {}

  list(actor: ActorContext, partnerTenantId: string): PartnerLicense[] {
    this.rbac.assert(actor, "licenses:read", { partnerTenantId });
    return this.licenses.listForPartner(partnerTenantId);
  }

  create(actor: ActorContext, input: PartnerLicenseDto): PartnerLicense {
    this.rbac.assert(actor, "licenses:create", { partnerTenantId: input.partnerTenantId, countryId: input.countryId });
    return this.licenses.create(input, actor);
  }

  validate(actor: ActorContext, licenseId: string): PartnerLicense {
    this.rbac.assert(actor, "licenses:approve");
    return this.licenses.validate(licenseId, actor);
  }
}
