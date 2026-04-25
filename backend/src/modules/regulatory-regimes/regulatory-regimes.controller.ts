import type { RegulatoryRegimeDto } from "../../../../packages/shared/contracts/catalog.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { RegulatoryRegimesService, type RegulatoryRegime } from "./regulatory-regimes.module";

export class RegulatoryRegimesController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly regimes: RegulatoryRegimesService) {}

  list(actor: ActorContext): RegulatoryRegime[] {
    this.rbac.assert(actor, "countries:read");
    return this.regimes.list();
  }

  create(actor: ActorContext, input: RegulatoryRegimeDto): RegulatoryRegime {
    this.rbac.assert(actor, "countries:create");
    return this.regimes.create(input, actor);
  }
}
