import type { CountryFlags, ProductFlags } from "../../../../packages/shared/contracts/catalog.contracts";

export interface PublicJourneyFlagInput {
  globalFlags?: Partial<Record<string, boolean>> | undefined;
  countryFlags?: Partial<CountryFlags> | undefined;
  productFlags?: Partial<ProductFlags> | undefined;
}

export interface PublicJourneyState {
  publicEnabled: boolean;
  comparisonEnabled: boolean;
  quoteEnabled: boolean;
  waitlistOnly: boolean;
  reasons: string[];
}

export class PublicJourneyFlagPolicy {
  resolve(input: PublicJourneyFlagInput): PublicJourneyState {
    const reasons: string[] = [];
    const globalComparator = input.globalFlags?.public_comparator_enabled === true;
    const globalQuote = input.globalFlags?.quote_request_enabled === true;
    const countryPublic = input.countryFlags?.country_public_enabled === true;
    const countryComparison = input.countryFlags?.country_comparison_enabled === true;
    const countryQuote = input.countryFlags?.country_quote_enabled === true;
    const productPublic = input.productFlags ? input.productFlags.product_public_enabled === true : true;
    const productComparison = input.productFlags ? input.productFlags.product_comparison_enabled === true : true;
    const productQuote = input.productFlags ? input.productFlags.product_quote_enabled === true : true;

    if (!globalComparator) reasons.push("public_comparator_disabled");
    if (!countryPublic) reasons.push("country_public_disabled");
    if (!productPublic) reasons.push("product_public_disabled");

    const publicEnabled = globalComparator && countryPublic && productPublic;
    const comparisonEnabled = publicEnabled && countryComparison && productComparison;
    const quoteEnabled = publicEnabled && globalQuote && countryQuote && productQuote;
    if (!comparisonEnabled) reasons.push("comparison_disabled");
    if (!quoteEnabled) reasons.push("quote_disabled");

    return {
      publicEnabled,
      comparisonEnabled,
      quoteEnabled,
      waitlistOnly: input.countryFlags?.country_waitlist_enabled === true && !countryPublic,
      reasons
    };
  }
}
