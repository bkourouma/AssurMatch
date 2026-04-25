import type { PartnerDto } from "../../../../packages/shared/contracts/partner.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { PartnersService, type PartnerTenant } from "./partners.module";

export class AdminPartnersController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly partners: PartnersService) {}

  list(actor: ActorContext): PartnerTenant[] {
    this.rbac.assert(actor, "partners:read");
    return this.partners.list();
  }

  create(actor: ActorContext, input: PartnerDto): PartnerTenant {
    this.rbac.assert(actor, "partners:create");
    return this.partners.create(input, actor);
  }

  update(actor: ActorContext, id: string, input: Partial<PartnerDto> & { reason: string }): PartnerTenant {
    this.rbac.assert(actor, "partners:update", { partnerTenantId: id });
    return this.partners.update(id, input, actor);
  }
}
