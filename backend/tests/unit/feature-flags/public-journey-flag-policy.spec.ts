import { describe, expect, it } from "vitest";
import { PublicJourneyFlagPolicy } from "../../../src/modules/feature-flags/public-journey-flag-policy";

describe("PublicJourneyFlagPolicy", () => {
  it("fails closed when global comparator, country or product flags are disabled", async () => {
    const policy = new PublicJourneyFlagPolicy();

    expect(policy.resolve({
      globalFlags: { public_comparator_enabled: false, quote_request_enabled: true },
      countryFlags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
      productFlags: { product_public_enabled: true, product_comparison_enabled: true, product_quote_enabled: true }
    }).publicEnabled).toBe(false);

    expect(policy.resolve({
      globalFlags: { public_comparator_enabled: true, quote_request_enabled: true },
      countryFlags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
      productFlags: { product_public_enabled: false }
    }).reasons).toContain("product_public_disabled");
  });

  it("requires quote flags at global, country and product scope", async () => {
    const state = new PublicJourneyFlagPolicy().resolve({
      globalFlags: { public_comparator_enabled: true, quote_request_enabled: false },
      countryFlags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
      productFlags: { product_public_enabled: true, product_comparison_enabled: true, product_quote_enabled: true }
    });

    expect(state.publicEnabled).toBe(true);
    expect(state.comparisonEnabled).toBe(true);
    expect(state.quoteEnabled).toBe(false);
    expect(state.reasons).toContain("quote_disabled");
  });
});
