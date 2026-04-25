import type { RoutingPrecheckRequestDto } from "../../../../packages/shared/contracts/ops.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { RoutingPrecheckService, type RoutingPrecheckResult } from "./routing.module";

export class AdminRoutingPrecheckController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly routing: RoutingPrecheckService) {}

  precheck(actor: ActorContext, input: RoutingPrecheckRequestDto): RoutingPrecheckResult {
    this.rbac.assert(actor, "partners:read", { partnerTenantId: input.partnerTenantId, countryId: input.countryId, productId: input.productId });
    return this.routing.evaluate(actor, input);
  }
}
