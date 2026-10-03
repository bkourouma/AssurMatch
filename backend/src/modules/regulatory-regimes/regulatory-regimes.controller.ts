import type { RegulatoryRegimeDto, RegulatoryRegimeUpdateDto } from "../../../../packages/shared/contracts/catalog.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { RegulatoryRegimesService, type RegulatoryRegime } from "./regulatory-regimes.module";

export class RegulatoryRegimesController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly regimes: RegulatoryRegimesService) {}

  list(actor: ActorContext): Promise<RegulatoryRegime[]> {
    this.rbac.assert(actor, "countries:read");
    return this.regimes.list();
  }

  create(actor: ActorContext, input: RegulatoryRegimeDto): Promise<RegulatoryRegime> {
    this.rbac.assert(actor, "countries:create");
    return this.regimes.create(input, actor);
  }

  update(actor: ActorContext, id: string, input: RegulatoryRegimeUpdateDto): Promise<RegulatoryRegime> {
    this.rbac.assert(actor, "countries:update");
    return this.regimes.update(id, input, actor);
  }

  retire(actor: ActorContext, id: string, reason: string): Promise<RegulatoryRegime> {
    this.rbac.assert(actor, "countries:update");
    return this.regimes.retire(id, reason, actor);
  }
}
