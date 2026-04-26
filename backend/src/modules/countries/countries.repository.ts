import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { Country } from "./countries.module";

export const COUNTRIES_REPOSITORY = Symbol("COUNTRIES_REPOSITORY");

export interface CountriesRepository extends RuntimeRepository {
  create(country: Country): Country;
  update(id: string, update: Partial<Country>): Country;
  list(): Country[];
  listPublic(): Country[];
  findByIsoCode(countryCode: string): Country | undefined;
  require(id: string): Country;
}

export class MemoryCountriesRepository implements CountriesRepository {
  readonly mode = "memory-test" as const;
  private readonly countries: Country[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "CountriesRepository");
  }

  create(country: Country): Country {
    this.countries.push(country);
    return country;
  }

  update(id: string, update: Partial<Country>): Country {
    const country = this.require(id);
    Object.assign(country, update);
    return country;
  }

  list(): Country[] {
    return [...this.countries];
  }

  listPublic(): Country[] {
    return this.countries.filter((country) =>
      country.status === "public" && (country.flags.country_public_enabled || country.flags.country_waitlist_enabled)
    );
  }

  findByIsoCode(countryCode: string): Country | undefined {
    return this.countries.find((candidate) => candidate.isoCode.toUpperCase() === countryCode.toUpperCase());
  }

  require(id: string): Country {
    const country = this.countries.find((candidate) => candidate.id === id);
    if (!country) throw new Error(`Country ${id} not found`);
    return country;
  }
}
