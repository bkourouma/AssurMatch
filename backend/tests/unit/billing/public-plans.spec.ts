import { describe, expect, it } from "vitest";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../../../src/modules/audit-logs/public-site-audit-actions";
import { BillingPlansService } from "../../../src/modules/billing/billing-plans.service";
import { MemoryBillingRepository, type BillingPlanPriceRecord } from "../../../src/modules/billing/billing.repository";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";

async function makeCountry(isoCode: string, audit: AuditLogWriter, brokerOnboardingEnabled: boolean) {
  const countries = new CountriesService(audit);
  await countries.create({
    isoCode,
    name: isoCode,
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Abidjan",
    regulatoryFamily: "cima",
    flags: { country_broker_onboarding_enabled: brokerOnboardingEnabled }
  }, superAdminActor);
  return countries;
}

function planRecord(countryCode: string, plan: "starter" | "pro" | "enterprise", overrides: Partial<BillingPlanPriceRecord> = {}): BillingPlanPriceRecord {
  const now = new Date("2026-04-01T00:00:00.000Z");
  return {
    id: crypto.randomUUID(),
    plan,
    countryCode,
    monthlySubscription: 50000,
    perLeadPrice: 1500,
    sharedLeadPriceMultiplier: 0.5,
    setupFee: 25000,
    currency: "XOF",
    reason: "initial pricing",
    updatedById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makeService(countries: CountriesService, repository = new MemoryBillingRepository(), audit = new AuditLogWriter()) {
  return {
    audit,
    repository,
    service: new BillingPlansService({
      audit,
      featureFlags: new FeatureFlagsService(audit),
      countries,
      repository
    })
  };
}

describe("BillingPlansService.listPublicForCountry", () => {
  it("returns the three plans in order for a country with rows", async () => {
    const audit = new AuditLogWriter();
    const countries = await makeCountry("CI", audit, true);
    const repository = new MemoryBillingRepository();
    await repository.upsertPlanPrice(planRecord("CI", "enterprise"));
    await repository.upsertPlanPrice(planRecord("CI", "starter"));
    await repository.upsertPlanPrice(planRecord("CI", "pro"));
    const { service } = makeService(countries, repository, audit);

    const response = await service.listPublicForCountry("CI");

    expect(response.items.map((item) => item.plan)).toEqual(["starter", "pro", "enterprise"]);
    expect(response.notice.length).toBeGreaterThan(0);
  });

  it("returns an empty array with the notice for a country with no rows", async () => {
    const audit = new AuditLogWriter();
    const countries = await makeCountry("SN", audit, true);
    const { service } = makeService(countries, new MemoryBillingRepository(), audit);

    const response = await service.listPublicForCountry("SN");

    expect(response.items).toEqual([]);
    expect(response.notice.length).toBeGreaterThan(0);
  });

  it("refuses with a message containing 'disabled' when the country's broker onboarding flag is off", async () => {
    const audit = new AuditLogWriter();
    const countries = await makeCountry("BJ", audit, false);
    const repository = new MemoryBillingRepository();
    await repository.upsertPlanPrice(planRecord("BJ", "starter"));
    const { service } = makeService(countries, repository, audit);

    await expect(service.listPublicForCountry("BJ")).rejects.toThrow(/disabled/);
  });

  it("refuses an unknown country", async () => {
    const audit = new AuditLogWriter();
    const countries = new CountriesService(audit);
    const { service } = makeService(countries, new MemoryBillingRepository(), audit);

    await expect(service.listPublicForCountry("ZZ")).rejects.toThrow(/not found/i);
  });

  it("never returns the sharedLeadPriceMultiplier field", async () => {
    const audit = new AuditLogWriter();
    const countries = await makeCountry("CI", audit, true);
    const repository = new MemoryBillingRepository();
    await repository.upsertPlanPrice(planRecord("CI", "starter"));
    const { service } = makeService(countries, repository, audit);

    const response = await service.listPublicForCountry("CI");

    expect(response.items[0]).not.toHaveProperty("sharedLeadPriceMultiplier");
    expect(Object.keys(response.items[0] ?? {}).sort()).toEqual(["currency", "monthlySubscription", "perLeadPrice", "plan", "setupFee"]);
  });

  it("returns plain numbers for the amounts, and writes an audit row", async () => {
    const audit = new AuditLogWriter();
    const countries = await makeCountry("CI", audit, true);
    const repository = new MemoryBillingRepository();
    await repository.upsertPlanPrice(planRecord("CI", "starter", { monthlySubscription: 50000, perLeadPrice: 1500, setupFee: 25000 }));
    const { service } = makeService(countries, repository, audit);

    const response = await service.listPublicForCountry("CI");

    const item = response.items[0];
    expect(typeof item?.monthlySubscription).toBe("number");
    expect(typeof item?.perLeadPrice).toBe("number");
    expect(typeof item?.setupFee).toBe("number");
    expect(item).toMatchObject({ monthlySubscription: 50000, perLeadPrice: 1500, setupFee: 25000, currency: "XOF" });

    const entries = audit.search({ action: PUBLIC_SITE_AUDIT_ACTIONS.publicPlansListed });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.result).toBe("success");
  });
});
