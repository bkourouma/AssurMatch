import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import {
  createRuntimeHttpHarness,
  seedBrokerOnboarding,
  seedPublicRuntime,
  seedWaitlistCountry,
  type RuntimeHttpHarness
} from "../runtime-http-test-utils";

interface DirectoryItem {
  isoCode: string;
  availability: "open" | "pilot" | "waitlist";
  comparisonEnabled: boolean;
  quoteEnabled: boolean;
}

describe("public catalog runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lists the insurers behind the publicly visible offers of a country", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const offer = await harness.runtime.offers.adminService.create({
      countryId: seed.country.id,
      productId: seed.product.id,
      partnerTenantId: seed.partner.id,
      name: "Auto Tiers NSIA",
      insurerName: "NSIA Assurances",
      indicativePriceMin: 12000,
      currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      reason: "insurer directory seed"
    }, seed.admin);
    await harness.runtime.offers.adminService.validate(offer.id, { validationStatus: "validated", reason: "insurer seed validate" }, seed.admin);

    const response = await harness.request("/countries/CI/insurers");

    expect(response.status).toBe(200);
    // The catalogue groups by product id; the controller resolves those ids to the public product
    // keys, because a raw identifier on a visitor-facing page means nothing to a reader.
    expect(await response.json()).toEqual([{ insurerName: "NSIA Assurances", offerCount: 1, productKeys: [seed.product.key] }]);
    expect(harness.runtime.audit.writer.search({ action: "public_insurers.listed" })).toHaveLength(1);
  });

  it("refuses insurers for a country that is not publicly available", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await seedWaitlistCountry(harness.runtime);

    const response = await harness.request("/countries/SN/insurers");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ message: "Country is not publicly available" });
  });

  it("serves indicative homepage counters", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const response = await harness.request("/public-stats");

    expect(response.status).toBe(200);
    const body = await response.json() as { openCountries: number; activeBrokers: number; validatedOffers: number; indicative: boolean };
    expect(body.indicative).toBe(true);
    expect(body.openCountries).toBe(1);
    expect(body.activeBrokers).toBe(1);
    expect(body.validatedOffers).toBe(1);
  });

  it("classifies every listed country as open, pilot or waitlist", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await seedWaitlistCountry(harness.runtime);
    const admin: ActorContext = seed.admin;
    const pilot = await harness.runtime.countries.service.create({
      isoCode: "BJ",
      name: "Benin",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Porto-Novo",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000012"
    }, admin);
    await harness.runtime.countries.service.update(pilot.id, {
      status: "pilot",
      flags: { country_public_enabled: false, country_comparison_enabled: false, country_quote_enabled: false },
      reason: "pilot directory seed"
    }, admin);

    const response = await harness.request("/countries/directory");

    expect(response.status).toBe(200);
    const items = await response.json() as DirectoryItem[];
    const byIsoCode = new Map(items.map((item) => [item.isoCode, item]));
    expect(byIsoCode.get("CI")).toMatchObject({ availability: "open", comparisonEnabled: true, quoteEnabled: true });
    expect(byIsoCode.get("BJ")).toMatchObject({ availability: "pilot", comparisonEnabled: false, quoteEnabled: false });
    expect(byIsoCode.get("SN")).toMatchObject({ availability: "waitlist", comparisonEnabled: false, quoteEnabled: false });
    // open first, then pilot, then waitlist.
    expect(items.map((item) => item.availability)).toEqual(["open", "pilot", "waitlist"]);
  });

  it("publishes the three plan prices once broker onboarding is open and refuses otherwise", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const refused = await harness.request("/partners/plans?country=CI");
    expect(refused.status).toBe(422);

    await seedBrokerOnboarding(harness.runtime);
    const response = await harness.request("/partners/plans?country=CI");

    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<{ plan: string; monthlySubscription: number; currency: string }>; notice: string };
    expect(body.items.map((item) => item.plan)).toEqual(["starter", "pro", "enterprise"]);
    expect(body.items.map((item) => item.monthlySubscription)).toEqual([25_000, 75_000, 250_000]);
    expect(body.items.every((item) => item.currency === "XOF")).toBe(true);
    expect(body.notice).toContain("aucun paiement");
    expect(harness.runtime.audit.writer.search({ action: "public_plans.listed" })).toHaveLength(1);
  });
});
