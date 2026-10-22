import type { ActorContext } from "../common/types";
import { countryCatalog, resolveScopeCodes } from "../common/scope/actor-scope-codes";
import type { CountriesService } from "../countries/countries.module";
import type { PartnersService } from "../partners/partners.module";

/** Same default country as the monthly draft when a broker has no country yet. */
const DEFAULT_BILLING_COUNTRY = "CI";

/**
 * Lot 5 (spec 071): country scope of an admin on the billing back-office routes, the same rule as invoicing:
 * `super_admin` or an actor without country scope sees every country (`null`), otherwise only the ISO codes
 * of the scope. A broker is in scope through its billing country.
 */
export class AdminCountryScope {
  constructor(private readonly deps: { countries: CountriesService; partners: PartnersService }) {}

  async of(actor: ActorContext): Promise<Set<string> | null> {
    if (actor.roles.includes("super_admin") || !actor.countryScopes?.length) return null;
    return new Set(resolveScopeCodes(actor.countryScopes, countryCatalog(await this.deps.countries.listAdmin())));
  }

  async countryOfPartner(partnerId: string): Promise<string | null> {
    const partner = await this.deps.partners.find(partnerId);
    if (!partner) return null;
    if (!partner.countryId) return DEFAULT_BILLING_COUNTRY;
    return (await this.deps.countries.listAdmin()).find((country) => country.id === partner.countryId)?.isoCode ?? null;
  }

  /** An unknown partner or country is out of scope for a scoped admin (fails closed). */
  async partnerInScope(scope: Set<string> | null, partnerId: string): Promise<boolean> {
    if (scope === null) return true;
    const code = await this.countryOfPartner(partnerId);
    return code !== null && scope.has(code);
  }
}
