import type { OfferAiSummaryView } from "../../../../packages/shared/contracts/ai.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import type { OfferAiSummaryService } from "./offer-ai-summary.service";

/** OFFER-010: read-only routes `GET /admin/offers/:id/ai-summary` and `GET /broker/offers/:id/ai-summary`. */
export class OfferAiSummaryController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly summaries: OfferAiSummaryService) {}

  adminRead(actor: ActorContext, offerId: string): Promise<OfferAiSummaryView> {
    this.rbac.assert(actor, "offers:read");
    return this.summaries.forAdmin(offerId, actor);
  }

  brokerRead(actor: ActorContext, offerId: string): Promise<OfferAiSummaryView> {
    this.rbac.assert(actor, "broker_offers:read");
    return this.summaries.forBroker(offerId, actor);
  }
}
