import type { CountryDto } from "../../../../packages/shared/contracts/catalog.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { CountriesService, type Country } from "./countries.module";

export class AdminCountriesController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly countries: CountriesService) {}

  list(actor: ActorContext): Country[] {
    this.rbac.assert(actor, "countries:read");
    return this.countries.listAdmin();
  }

  create(actor: ActorContext, input: CountryDto): Country {
    this.rbac.assert(actor, "countries:create");
    return this.countries.create(input, actor);
  }

  update(actor: ActorContext, id: string, input: Partial<CountryDto> & { reason: string }): Country {
    this.rbac.assert(actor, "countries:update", { countryId: id });
    return this.countries.update(id, input, actor);
  }
}
