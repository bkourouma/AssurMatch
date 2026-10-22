import { MAX_QUOTE_OFFERS, quoteOptionsResponseSchema, type QuoteOptionsResponse } from "../../../../packages/shared/contracts/quote.contracts";
import { uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import type { Country } from "../countries/countries.module";
import type { Product } from "../products/products.module";

const MAX_BROKERS = 50;
const NOT_AVAILABLE = "Quote options are not publicly available";

type Maybe<T> = T | Promise<T>;

export interface QuoteOptionsDependencies {
  findCountryByCode(isoCode: string): Maybe<Country | undefined>;
  findProductByKey(key: string): Maybe<Product | undefined>;
  /** Flag `multi_broker_routing_enabled`. */
  isMultiBrokerEnabled(): boolean;
  documentUploadEnabled(countryId: string, productId: string): Maybe<boolean>;
  verifyOffer(offerId: string, countryId: string, productId: string): Promise<{ accepted: true; partnerTenantId?: string | undefined } | { accepted: false; reason: string }>;
  partnerName(partnerTenantId: string): Promise<string | undefined>;
  eligibleBrokers(countryId: string, productId: string): Promise<Array<{ id: string; displayName: string }>>;
  /** Same journey gating as the quote form read: false when the quote journey is closed for this scope. */
  quoteJourneyOpen(country: Country, product: Product): boolean;
}

/** Spec 067: public, personal-data-free options of the quote form (multi-broker, documents, offers, brokers). */
export class QuoteOptionsService {
  constructor(private readonly deps: QuoteOptionsDependencies) {}

  async options(countryCode: string, productKey: string, offerIdsRaw: string | undefined): Promise<QuoteOptionsResponse> {
    const country = await this.deps.findCountryByCode(countryCode);
    const product = await this.deps.findProductByKey(productKey);
    if (!country || !product || !this.deps.quoteJourneyOpen(country, product)) throw new Error(NOT_AVAILABLE);

    const offers: QuoteOptionsResponse["offers"] = [];
    for (const offerId of this.parseOfferIds(offerIdsRaw)) {
      try {
        const verdict = await this.deps.verifyOffer(offerId, country.id, product.id);
        if (!verdict.accepted) continue;
        const partnerName = verdict.partnerTenantId ? await this.deps.partnerName(verdict.partnerTenantId) : undefined;
        offers.push(verdict.partnerTenantId && partnerName
          ? { offerId, partnerId: verdict.partnerTenantId, partnerName }
          : { offerId });
      } catch {
        // An offer that cannot be verified is simply left out.
      }
    }

    const seen = new Set<string>();
    const brokers: QuoteOptionsResponse["brokers"] = await (async () => this.deps.eligibleBrokers(country.id, product.id))()
      .then((list) => list
        .filter((broker) => (seen.has(broker.id) ? false : (seen.add(broker.id), true)))
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"))
        .slice(0, MAX_BROKERS))
      .catch(() => []);

    const documentUploadEnabled = await (async () => this.deps.documentUploadEnabled(country.id, product.id))()
      .then((enabled) => enabled === true)
      .catch(() => false);

    return quoteOptionsResponseSchema.parse({
      multiBrokerAvailable: this.deps.isMultiBrokerEnabled(),
      maxOffers: MAX_QUOTE_OFFERS,
      documentUploadEnabled,
      offers,
      brokers
    });
  }

  private parseOfferIds(raw: string | undefined): string[] {
    if (!raw) return [];
    const ids: string[] = [];
    for (const part of raw.split(",")) {
      const parsed = uuidSchema.safeParse(part.trim());
      if (parsed.success && !ids.includes(parsed.data)) ids.push(parsed.data);
      if (ids.length >= MAX_QUOTE_OFFERS) break;
    }
    return ids;
  }
}
