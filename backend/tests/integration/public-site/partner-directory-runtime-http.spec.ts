import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

/** Never exposed by the public directory: commercial terms and direct contact details. */
const FORBIDDEN_KEYS = ["plan", "primaryEmail", "primaryWhatsApp", "quotaMonthlyLeads", "capacityStatus"] as const;

interface PublicPartner {
  id: string;
  displayName: string;
  city: string | null;
  licenseNumber: string;
  productKeys: string[];
}

describe("public partner directory runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  /**
   * Seeds a second, deliberately ineligible partner. Everything is set up except the tenant status,
   * so the only reason it must not appear is the eligibility rule itself. The directory caches its
   * computed list for a minute, so both partners exist before the first read.
   */
  async function seedIneligiblePartner(runtime: RuntimeHttpHarness["runtime"], seed: Awaited<ReturnType<typeof seedPublicRuntime>>) {
    const partner = await runtime.partners.service.create({
      legalName: "Broker CI Suspendu",
      primaryEmail: "suspendu@broker.example",
      primaryWhatsApp: "+2250102030409",
      status: "active",
      quotaMonthlyLeads: 5
    }, seed.admin);
    await runtime.partners.service.authorizeCountry(partner.id, seed.country.id, seed.admin);
    await runtime.partners.service.authorizeProduct(partner.id, seed.product.id, seed.admin);
    await runtime.partnerLicenses.service.create({
      partnerTenantId: partner.id,
      licenseNumber: "LIC-SUSPENDU",
      issuingAuthority: "Regulator",
      countryId: seed.country.id,
      productIds: [seed.product.id],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01"
    }, seed.admin);
    await runtime.partners.service.update(partner.id, {
      status: "suspended",
      suspensionReason: "directory eligibility fixture",
      reason: "directory eligibility fixture"
    }, seed.admin);
    return partner;
  }

  it("lists only eligible partners and never leaks commercial or contact fields", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const ineligible = await seedIneligiblePartner(harness.runtime, seed);

    const response = await harness.request("/countries/CI/partners");

    expect(response.status).toBe(200);
    const items = await response.json() as PublicPartner[];
    expect(items.map((item) => item.id)).toEqual([seed.partner.id]);
    expect(items.map((item) => item.id)).not.toContain(ineligible.id);
    for (const key of FORBIDDEN_KEYS) {
      expect(Object.keys(items[0] ?? {}), key).not.toContain(key);
    }
    expect(items[0]?.productKeys).toEqual(["auto"]);
    expect(harness.runtime.audit.writer.search({ action: "public_partner.listed" })).toHaveLength(1);
  });

  it("serves an eligible partner detail and refuses an ineligible one with 404", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const ineligible = await seedIneligiblePartner(harness.runtime, seed);

    const detail = await harness.request(`/countries/CI/partners/${seed.partner.id}`);
    expect(detail.status).toBe(200);
    const body = await detail.json() as PublicPartner & { products: Array<{ key: string; name: string }>; disclaimer: string };
    expect(body.id).toBe(seed.partner.id);
    expect(body.products).toEqual([{ key: "auto", name: "Assurance auto" }]);
    expect(body.disclaimer).toContain("partenaire agree");
    for (const key of FORBIDDEN_KEYS) {
      expect(Object.keys(body), key).not.toContain(key);
    }

    const refused = await harness.request(`/countries/CI/partners/${ineligible.id}`);
    expect(refused.status).toBe(404);
    const refusals = harness.runtime.audit.writer.search({ action: "public_partner.refused" });
    expect(refusals.at(-1)?.reason).toBe("partner_not_eligible");
    expect(harness.runtime.audit.writer.search({ action: "public_partner.exposed" })).toHaveLength(1);
  });

  it("refuses a country that is not publicly available", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const response = await harness.request("/countries/SN/partners");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ message: "Country is not publicly available" });
  });
});
