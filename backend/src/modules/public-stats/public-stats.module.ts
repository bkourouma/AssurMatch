import type { PublicStats } from "../../../../packages/shared/contracts/public-site.contracts";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import { CountriesService } from "../countries/countries.module";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { OfferPublicationPolicy } from "../offers/offer-publication-policy";
import { MemoryOffersRepository, type OffersRepository } from "../offers/offers.repository";
import { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import { PartnersService } from "../partners/partners.module";
import { isLicenseCurrentlyValid } from "../partners/public-partner-directory.service";

export interface PublicStatsContext {
  globalFlags?: Partial<Record<string, boolean>> | undefined;
}

const CACHE_KEY = "public:stats";
const CACHE_TTL_SECONDS = 300;
const DEFAULT_GLOBAL_FLAGS: Partial<Record<string, boolean>> = { public_comparator_enabled: true };

function emptyStats(): PublicStats {
  return { openCountries: 0, activeBrokers: 0, validatedOffers: 0, computedAt: new Date().toISOString(), indicative: true };
}

/**
 * Homepage counters (PRD constitution I): purely indicative, cached for 5 minutes, and never
 * throws — any internal failure degrades to zeros rather than breaking the public homepage.
 */
export class PublicStatsService {
  private readonly journeyFlagPolicy = new PublicJourneyFlagPolicy();
  private readonly offerPolicy = new OfferPublicationPolicy();

  constructor(
    private readonly countries: CountriesService,
    private readonly partners: PartnersService,
    private readonly licenses: PartnerLicensesService,
    private readonly offers: OffersRepository = new MemoryOffersRepository(),
    private readonly cache: RedisClientPort = new InMemoryRedisClient()
  ) {}

  async read(context: PublicStatsContext = {}): Promise<PublicStats> {
    const cached = await this.safeCacheGet();
    if (cached) return cached;
    const stats = await this.computeSafely(context);
    await this.safeCacheSet(stats);
    return stats;
  }

  private async computeSafely(context: PublicStatsContext): Promise<PublicStats> {
    try {
      const globalFlags = context.globalFlags ?? DEFAULT_GLOBAL_FLAGS;
      const [openCountries, activeBrokers, validatedOffers] = await Promise.all([
        this.countOpenCountries(globalFlags),
        this.countActiveBrokers(),
        this.countValidatedOffers()
      ]);
      return { openCountries, activeBrokers, validatedOffers, computedAt: new Date().toISOString(), indicative: true };
    } catch {
      return emptyStats();
    }
  }

  private async countOpenCountries(globalFlags: Partial<Record<string, boolean>>): Promise<number> {
    const countries = await this.countries.listAdmin();
    return countries.filter((country) => this.journeyFlagPolicy.resolve({ globalFlags, countryFlags: country.flags }).publicEnabled).length;
  }

  private async countActiveBrokers(): Promise<number> {
    const tenants = await this.partners.list();
    let count = 0;
    for (const tenant of tenants) {
      if (tenant.status !== "active") continue;
      const licenses = await this.licenses.listForPartner(tenant.id);
      if (licenses.some((license) => isLicenseCurrentlyValid(license))) count += 1;
    }
    return count;
  }

  private async countValidatedOffers(): Promise<number> {
    const offers = await this.offers.list();
    return offers.filter((offer) => this.offerPolicy.evaluate(offer).public).length;
  }

  private async safeCacheGet(): Promise<PublicStats | undefined> {
    try {
      const raw = await this.cache.get(CACHE_KEY);
      return raw ? (JSON.parse(raw) as PublicStats) : undefined;
    } catch {
      return undefined;
    }
  }

  private async safeCacheSet(stats: PublicStats): Promise<void> {
    try {
      await this.cache.set(CACHE_KEY, JSON.stringify(stats), CACHE_TTL_SECONDS);
    } catch {
      // best-effort cache only; never let a cache failure surface to callers
    }
  }
}

export class PublicStatsModule {
  readonly service: PublicStatsService;

  constructor(
    countries: CountriesService,
    partners: PartnersService,
    licenses: PartnerLicensesService,
    offers?: OffersRepository,
    cache?: RedisClientPort
  ) {
    this.service = new PublicStatsService(countries, partners, licenses, offers, cache);
  }
}
