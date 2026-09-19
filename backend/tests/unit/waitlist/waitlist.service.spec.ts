import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogsModule } from "../../../src/modules/audit-logs/audit-logs.module";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../../../src/modules/audit-logs/public-site-audit-actions";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import { CountriesModule, type Country } from "../../../src/modules/countries/countries.module";
import { ProductsModule, type Product } from "../../../src/modules/products/products.module";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import { WaitlistModule } from "../../../src/modules/waitlist/waitlist.module";

const actor: ActorContext = {
  actorId: "00000000-0000-4000-8000-000000000099",
  roles: ["super_admin"],
  mfaVerified: true,
  correlationId: "waitlist-test"
};

const RAW_EMAIL = "Jane.Doe@Example.com";

interface Harness {
  audit: AuditLogsModule;
  countries: CountriesModule;
  products: ProductsModule;
  waitlist: WaitlistModule;
}

function buildHarness(): Harness {
  const audit = new AuditLogsModule();
  const countries = new CountriesModule(audit.writer);
  const products = new ProductsModule(audit.writer);
  const identity = new ProspectIdentityService();
  const waitlist = new WaitlistModule(
    {
      findCountryByCode: (countryCode) => countries.service.findByIsoCode(countryCode),
      findProductByKey: (productKey) => products.service.findByKey(productKey),
      identity
    },
    audit.writer,
    new InMemoryRedisClient()
  );
  return { audit, countries, products, waitlist };
}

async function createWaitlistOnlyCountry(harness: Harness, isoCode = "SN"): Promise<Country> {
  return harness.countries.service.create(
    {
      isoCode,
      name: "Senegal",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Dakar",
      regulatoryFamily: "cima",
      status: "internal",
      flags: {
        country_public_enabled: false,
        country_waitlist_enabled: true,
        country_quote_enabled: false,
        country_comparison_enabled: false,
        country_broker_onboarding_enabled: false,
        country_ai_enabled: false
      }
    },
    actor
  );
}

async function createPublicCountry(harness: Harness, isoCode = "CI"): Promise<Country> {
  return harness.countries.service.create(
    {
      isoCode,
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      status: "public",
      flags: {
        country_public_enabled: true,
        country_waitlist_enabled: true,
        country_quote_enabled: false,
        country_comparison_enabled: false,
        country_broker_onboarding_enabled: false,
        country_ai_enabled: false
      }
    },
    actor
  );
}

async function createProduct(harness: Harness, key: string, countryId?: string): Promise<Product> {
  const product = await harness.products.service.create(
    {
      key,
      name: `Produit ${key}`,
      sensitivity: "standard"
    },
    actor
  );
  if (countryId) await harness.products.service.associateCountry(product.id, countryId, actor);
  return product;
}

describe("WaitlistService.subscribe", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it("accepts a valid subscription and audits waitlist.subscribed without the raw e-mail", async () => {
    const country = await createWaitlistOnlyCountry(harness);

    const response = await harness.waitlist.service.subscribe(
      { countryCode: country.isoCode, email: RAW_EMAIL, consent: true },
      { ipAddress: "203.0.113.20", actor }
    );

    expect(response).toEqual({
      status: "accepted",
      countryCode: country.isoCode,
      message: expect.any(String)
    });

    const subscribedRows = harness.audit.writer.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistSubscribed });
    expect(subscribedRows).toHaveLength(1);
    expect(subscribedRows[0]?.scope).toMatchObject({ countryId: country.id });
  });

  it("refuses and audits waitlist.refused when the country is public rather than waitlist-only", async () => {
    const country = await createPublicCountry(harness);

    await expect(
      harness.waitlist.service.subscribe(
        { countryCode: country.isoCode, email: RAW_EMAIL, consent: true },
        { ipAddress: "203.0.113.21", actor }
      )
    ).rejects.toThrow(/disabled/i);

    const refusedRows = harness.audit.writer.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistRefused });
    expect(refusedRows).toHaveLength(1);
  });

  it("refuses an unknown country", async () => {
    await expect(
      harness.waitlist.service.subscribe(
        { countryCode: "ZZ", email: RAW_EMAIL, consent: true },
        { ipAddress: "203.0.113.22", actor }
      )
    ).rejects.toThrow(/not found/i);
  });

  it("is idempotent on a duplicate subscription and writes the duplicate audit action without revealing it", async () => {
    const country = await createWaitlistOnlyCountry(harness);
    const input = { countryCode: country.isoCode, email: RAW_EMAIL, consent: true };

    const first = await harness.waitlist.service.subscribe(input, { ipAddress: "203.0.113.23", actor });
    const second = await harness.waitlist.service.subscribe(input, { ipAddress: "203.0.113.23", actor });

    expect(second).toEqual(first);
    expect(harness.audit.writer.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistSubscribed })).toHaveLength(1);
    expect(harness.audit.writer.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistDuplicateIgnored })).toHaveLength(1);
  });

  it("rejects a filled honeypot", async () => {
    const country = await createWaitlistOnlyCountry(harness);

    await expect(
      harness.waitlist.service.subscribe(
        { countryCode: country.isoCode, email: RAW_EMAIL, consent: true, website: "https://spam.example" },
        { ipAddress: "203.0.113.24", actor }
      )
    ).rejects.toThrow(/invalid submission/i);
  });

  it("rejects submissions past the rate limit", async () => {
    const country = await createWaitlistOnlyCountry(harness);
    const ipAddress = "203.0.113.25";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await harness.waitlist.service.subscribe(
        { countryCode: country.isoCode, email: RAW_EMAIL, consent: true },
        { ipAddress, actor }
      );
    }

    await expect(
      harness.waitlist.service.subscribe(
        { countryCode: country.isoCode, email: RAW_EMAIL, consent: true },
        { ipAddress, actor }
      )
    ).rejects.toThrow(/rate limit/i);
  });

  it("rejects a product that is not associated with the country", async () => {
    const country = await createWaitlistOnlyCountry(harness);
    const otherCountry = await createWaitlistOnlyCountry(harness, "TG");
    const productForOtherCountry = await createProduct(harness, "auto-other", otherCountry.id);

    await expect(
      harness.waitlist.service.subscribe(
        { countryCode: country.isoCode, email: RAW_EMAIL, consent: true, productKey: productForOtherCountry.key },
        { ipAddress: "203.0.113.26", actor }
      )
    ).rejects.toThrow(/validation|invalid/i);
  });

  it("accepts a product key that is associated with the country", async () => {
    const country = await createWaitlistOnlyCountry(harness);
    const product = await createProduct(harness, "auto-sn", country.id);

    const response = await harness.waitlist.service.subscribe(
      { countryCode: country.isoCode, email: RAW_EMAIL, consent: true, productKey: product.key },
      { ipAddress: "203.0.113.27", actor }
    );

    expect(response.status).toBe("accepted");
    const subscribedRows = harness.audit.writer.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.waitlistSubscribed });
    expect(subscribedRows).toHaveLength(1);
    expect(subscribedRows[0]?.scope).toMatchObject({ countryId: country.id, productId: product.id });
  });

  it("never writes the raw e-mail address into any audit context", async () => {
    const country = await createWaitlistOnlyCountry(harness);
    const input = { countryCode: country.isoCode, email: RAW_EMAIL, consent: true };

    await harness.waitlist.service.subscribe(input, { ipAddress: "203.0.113.28", actor });
    await harness.waitlist.service.subscribe(input, { ipAddress: "203.0.113.28", actor });

    const serializedContexts = harness.audit.writer
      .all()
      .map((entry) => JSON.stringify(entry.context))
      .join("\n");
    expect(serializedContexts.toLowerCase()).not.toContain(RAW_EMAIL.toLowerCase());
    expect(serializedContexts.toLowerCase()).not.toContain("jane.doe");
  });
});
