import type { PublicCountryAvailability, PublicCountryDirectoryItem } from "../../../../packages/shared/contracts/public-site.contracts";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import { PublicJourneyFlagPolicy, type PublicJourneyState } from "../feature-flags/public-journey-flag-policy";
import type { Country } from "./countries.module";
import { MemoryCountriesRepository, type CountriesRepository } from "./countries.repository";

export interface PublicCountryDirectoryContext {
  globalFlags?: Partial<Record<string, boolean>> | undefined;
}

const CACHE_KEY = "public:countries:directory";
const CACHE_TTL_SECONDS = 300;
const DEFAULT_GLOBAL_FLAGS: Partial<Record<string, boolean>> = { public_comparator_enabled: true };
/**
 * Countries visible on the public directory: `public` and `pilot` status always qualify; every
 * other status (draft, internal, partner_test, suspended, retired) is excluded unless the
 * waitlist flag is explicitly on. `listPublic()` cannot answer this (it only matches
 * status === "public"), so this service reads the repository's unfiltered `list()` instead.
 */
const ALWAYS_INCLUDED_STATUSES = new Set(["public", "pilot"]);
const AVAILABILITY_RANK: Record<PublicCountryAvailability, number> = { open: 0, pilot: 1, waitlist: 2 };

export class PublicCountryDirectoryService {
  private readonly journeyFlagPolicy = new PublicJourneyFlagPolicy();

  constructor(
    private readonly repository: CountriesRepository = new MemoryCountriesRepository(),
    private readonly cache: RedisClientPort = new InMemoryRedisClient()
  ) {}

  async list(context: PublicCountryDirectoryContext = {}): Promise<PublicCountryDirectoryItem[]> {
    const cached = await this.safeCacheGet();
    if (cached) return cached;
    const items = await this.computeSafely(context);
    await this.safeCacheSet(items);
    return items;
  }

  private async computeSafely(context: PublicCountryDirectoryContext): Promise<PublicCountryDirectoryItem[]> {
    try {
      const globalFlags = context.globalFlags ?? DEFAULT_GLOBAL_FLAGS;
      const countries = await this.repository.list();
      return countries
        .filter((country) => this.isIncluded(country))
        .map((country) => this.toItem(country, globalFlags))
        .sort((a, b) => AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability] || a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  private isIncluded(country: Country): boolean {
    return ALWAYS_INCLUDED_STATUSES.has(country.status) || country.flags.country_waitlist_enabled === true;
  }

  private toItem(country: Country, globalFlags: Partial<Record<string, boolean>>): PublicCountryDirectoryItem {
    const state = this.journeyFlagPolicy.resolve({ globalFlags, countryFlags: country.flags });
    return {
      isoCode: country.isoCode,
      name: country.name,
      currency: country.currency,
      languages: country.languages,
      availability: this.availability(country, state),
      comparisonEnabled: state.comparisonEnabled,
      quoteEnabled: state.quoteEnabled
    };
  }

  private availability(country: Country, state: PublicJourneyState): PublicCountryAvailability {
    if (state.publicEnabled) return "open";
    if (country.status === "pilot") return "pilot";
    return "waitlist";
  }

  private async safeCacheGet(): Promise<PublicCountryDirectoryItem[] | undefined> {
    try {
      const raw = await this.cache.get(CACHE_KEY);
      return raw ? (JSON.parse(raw) as PublicCountryDirectoryItem[]) : undefined;
    } catch {
      return undefined;
    }
  }

  private async safeCacheSet(items: PublicCountryDirectoryItem[]): Promise<void> {
    try {
      await this.cache.set(CACHE_KEY, JSON.stringify(items), CACHE_TTL_SECONDS);
    } catch {
      // best-effort cache only; never let a cache failure surface to callers
    }
  }
}
