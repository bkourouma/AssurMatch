import type { AdminOfferUpsertDto, OfferValidationDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import { OfferAdminService } from "./offer-admin.service";

export class AdminOffersController {
  constructor(private readonly admin: OfferAdminService) {}

  list() {
    return this.admin.list();
  }

  create(input: AdminOfferUpsertDto, actor: ActorContext) {
    return this.admin.create(input, actor);
  }

  update(id: string, input: AdminOfferUpsertDto, actor: ActorContext) {
    return this.admin.update(id, input, actor);
  }

  validate(id: string, input: OfferValidationDto, actor: ActorContext) {
    return this.admin.validate(id, input, actor);
  }
}
