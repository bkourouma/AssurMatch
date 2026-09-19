import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";
import { MemoryOffersRepository } from "../../../src/modules/offers/offers.repository";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { PublicStatsService } from "../../../src/modules/public-stats/public-stats.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

function dateOnly(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function offer(overrides: Partial<OfferRecord> = {}): OfferRecord {
  return {
    id: crypto.randomUUID(),
    countryId: "00000000-0000-4000-8000-000000000030",
    productId: "00000000-0000-4000-8000-000000000040",
    publicKey: `offer-${crypto.randomUUID()}`,
    name: "Offre test",
    currency: "XOF",
    status: "active",
    validationStatus: "validated",
    validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    isSponsored: false,
    displayPriority: 0,
    publicDisclaimers: ["offre indicative a confirmer"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

async function setup() {
  const audit = new AuditLogWriter();
  const countries = new CountriesService(audit);
  const partners = new PartnersService(audit);
  const licenses = new PartnerLicensesService(audit);
  const offers = new MemoryOffersRepository();
  const cache = new InMemoryRedisClient();
  const service = new PublicStatsService(countries, partners, licenses, offers, cache);
  return { audit, countries, partners, licenses, offers, cache, service };
}

describe("PublicStatsService", () => {
  it("counts open countries, active brokers and validated offers", async () => {
    const ctx = await setup();

    await ctx.countries.create(
      {
        isoCode: "CI",
        name: "Cote d'Ivoire",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Abidjan",
        regulatoryFamily: "cima",
        status: "public",
        flags: { country_public_enabled: true }
      },
      superAdminActor
    );
    await ctx.countries.create(
      {
        isoCode: "SN",
        name: "Senegal",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Dakar",
        regulatoryFamily: "cima",
        status: "internal",
        flags: { country_public_enabled: false }
      },
      superAdminActor
    );

    const activeBroker = await ctx.partners.create(
      { legalName: "Active Broker", status: "active", primaryEmail: "active@broker.example", primaryWhatsApp: "+2250102030405" },
      superAdminActor
    );
    await ctx.licenses.create(
      {
        partnerTenantId: activeBroker.id,
        licenseNumber: "LIC-ACTIVE",
        issuingAuthority: "CIMA",
        countryId: "00000000-0000-4000-8000-000000000030",
        status: "valid",
        effectiveDate: dateOnly(-365),
        expirationDate: dateOnly(365)
      },
      superAdminActor
    );

    const expiredBroker = await ctx.partners.create(
      { legalName: "Expired Broker", status: "active", primaryEmail: "expired@broker.example", primaryWhatsApp: "+2250102030406" },
      superAdminActor
    );
    await ctx.licenses.create(
      {
        partnerTenantId: expiredBroker.id,
        licenseNumber: "LIC-EXPIRED",
        issuingAuthority: "CIMA",
        countryId: "00000000-0000-4000-8000-000000000030",
        status: "valid",
        effectiveDate: dateOnly(-365),
        expirationDate: dateOnly(-1)
      },
      superAdminActor
    );

    const suspendedBroker = await ctx.partners.create(
      { legalName: "Suspended Broker", status: "suspended", suspensionReason: "risk hold", primaryEmail: "suspended@broker.example", primaryWhatsApp: "+2250102030407" },
      superAdminActor
    );
    await ctx.licenses.create(
      {
        partnerTenantId: suspendedBroker.id,
        licenseNumber: "LIC-SUSPENDED",
        issuingAuthority: "CIMA",
        countryId: "00000000-0000-4000-8000-000000000030",
        status: "valid",
        effectiveDate: dateOnly(-365),
        expirationDate: dateOnly(365)
      },
      superAdminActor
    );

    await ctx.offers.create(offer());
    await ctx.offers.create(offer({ status: "draft", validationStatus: "pending" }));

    const stats = await ctx.service.read();
    expect(stats.openCountries).toBe(1);
    expect(stats.activeBrokers).toBe(1);
    expect(stats.validatedOffers).toBe(1);
    expect(stats.indicative).toBe(true);
  });

  it("returns zero open countries when the global comparator flag is off", async () => {
    const ctx = await setup();
    await ctx.countries.create(
      {
        isoCode: "CI",
        name: "Cote d'Ivoire",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Abidjan",
        regulatoryFamily: "cima",
        status: "public",
        flags: { country_public_enabled: true }
      },
      superAdminActor
    );

    const stats = await ctx.service.read({ globalFlags: { public_comparator_enabled: false } });
    expect(stats.openCountries).toBe(0);
  });

  it("returns the identical computedAt on a second call within the cache window", async () => {
    const ctx = await setup();
    const first = await ctx.service.read();
    const second = await ctx.service.read();
    expect(second.computedAt).toBe(first.computedAt);
  });

  it("never throws: falls back to zeros when a dependency fails", async () => {
    const audit = new AuditLogWriter();
    const countries = new CountriesService(audit);
    const partners = new PartnersService(audit);
    const licenses = new PartnerLicensesService(audit);
    const brokenOffers = {
      mode: "memory-test" as const,
      list: () => Promise.reject(new Error("boom")),
      create: () => Promise.reject(new Error("boom")),
      update: () => Promise.reject(new Error("boom")),
      appendHistory: () => Promise.reject(new Error("boom")),
      history: () => Promise.reject(new Error("boom")),
      require: () => Promise.reject(new Error("boom"))
    };
    const service = new PublicStatsService(countries, partners, licenses, brokenOffers, new InMemoryRedisClient());

    const stats = await service.read();
    expect(stats).toEqual({ openCountries: 0, activeBrokers: 0, validatedOffers: 0, computedAt: stats.computedAt, indicative: true });
  });
});
