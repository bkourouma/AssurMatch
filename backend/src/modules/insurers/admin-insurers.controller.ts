import type { AdminInsurerView, InsurerChoice } from "../../../../packages/shared/contracts/insurer.contracts";
import type { ActorContext } from "../common/types";
import { InsurersService } from "./insurers.service";

/** Bare controller (the HTTP wiring owns the routes): `/admin/insurers` and `/broker/insurers`. */
export class AdminInsurersController {
  constructor(private readonly insurers: InsurersService) {}

  list(actor: ActorContext, query: unknown = {}): Promise<AdminInsurerView[]> {
    return this.insurers.list(query, actor);
  }

  detail(id: string, actor: ActorContext): Promise<AdminInsurerView> {
    return this.insurers.get(id, actor);
  }

  create(input: unknown, actor: ActorContext): Promise<AdminInsurerView> {
    return this.insurers.create(input, actor);
  }

  update(id: string, input: unknown, actor: ActorContext): Promise<AdminInsurerView> {
    return this.insurers.update(id, input, actor);
  }

  retire(id: string, input: unknown, actor: ActorContext): Promise<AdminInsurerView> {
    return this.insurers.retire(id, input, actor);
  }

  /** GET /broker/insurers?countryId= (active insurers, light view). */
  choices(countryId: string, actor: ActorContext): Promise<InsurerChoice[]> {
    return this.insurers.listChoices(countryId, actor);
  }
}
