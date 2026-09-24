import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import { CountriesService, type Country } from "../../../src/modules/countries/countries.module";
import { PartnerApplicationsModule, type PartnerApplicationsService } from "../../../src/modules/partner-applications/partner-applications.module";
import { ProductsService } from "../../../src/modules/products/products.module";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";

const superAdminActor: ActorContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  roles: ["super_admin"],
  mfaVerified: true
};

const unauthorizedActor: ActorContext = {
  actorId: "00000000-0000-4000-8000-000000000002",
  roles: ["broker_owner_starter"],
  mfaVerified: true
};

interface Harness {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  service: PartnerApplicationsService;
  country: Country;
}

async function harness(options: { onboardingEnabled?: boolean; countryStatus?: "draft" | "internal" | "partner_test" | "pilot" | "public" | "suspended" | "retired" } = {}): Promise<Harness> {
  const audit = new AuditLogWriter();
  const countries = new CountriesService(audit);
  const products = new ProductsService(audit);
  const identity = new ProspectIdentityService();

  const country = await countries.create(
    {
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      status: options.countryStatus ?? "pilot",
      flags: { country_broker_onboarding_enabled: options.onboardingEnabled ?? true }
    },
    superAdminActor
  );

  const product = await products.create({ key: "auto", name: "Assurance auto", sensitivity: "standard" }, superAdminActor);
  await products.associateCountry(product.id, country.id, superAdminActor);

  const module = new PartnerApplicationsModule(
    {
      findCountryByCode: (code) => countries.findByIsoCode(code),
      findProductByKey: (key) => products.findByKey(key),
      identity
    },
    audit,
    new InMemoryRedisClient()
  );

  return { audit, countries, products, service: module.service, country };
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legalName: "Courtage Soleil SARL",
    countryCode: "CI",
    licenseNumber: "LIC-0001",
    licenseExpiresAt: "2030-01-01",
    productKeys: ["auto"],
    monthlyCapacity: 50,
    contactName: "Awa Kone",
    contactEmail: "awa.kone@example.com",
    contactPhone: "+2250102030405",
    desiredPlan: "starter",
    consent: true,
    ...overrides
  };
}

describe("PartnerApplicationsService.submit", () => {
  it("accepts an application when broker onboarding is enabled for the country", async () => {
    const { service, audit } = await harness();

    const response = await service.submit(payload(), { ipAddress: "203.0.113.1" });

    expect(response.status).toBe("received");
    expect(response.publicReference).toMatch(/^PA-\d{4}-[0-9a-f]{8}$/);
    expect(response.message.toLowerCase()).toContain("e-mail");
    expect(response.nextSteps.some((step) => step.toLowerCase().includes("e-mail"))).toBe(true);

    const list = await service.listForAdmin(superAdminActor);
    expect(list).toHaveLength(1);
    expect(list[0]?.publicReference).toBe(response.publicReference);

    const received = audit.search({ action: "partner_application.received" });
    expect(received).toHaveLength(1);
  });

  it("refuses and creates nothing when broker onboarding is disabled for the country", async () => {
    const { service, audit } = await harness({ onboardingEnabled: false });

    await expect(service.submit(payload(), { ipAddress: "203.0.113.2" })).rejects.toThrow(/disabled/i);

    expect(await service.listForAdmin(superAdminActor)).toHaveLength(0);
    const refused = audit.search({ action: "partner_application.refused" });
    expect(refused).toHaveLength(1);
    expect(refused[0]?.result).toBe("refused");
  });

  it("refuses an unknown country", async () => {
    const { service } = await harness();

    await expect(service.submit(payload({ countryCode: "SN" }), { ipAddress: "203.0.113.3" })).rejects.toThrow("Country not found");
  });

  it("refuses a product not associated with the country", async () => {
    const { service } = await harness();

    await expect(service.submit(payload({ productKeys: ["home"] }), { ipAddress: "203.0.113.4" })).rejects.toThrow(/validation|invalid/i);
  });

  it("returns the same reference for a duplicate and does not create a second row", async () => {
    const { service } = await harness();

    const first = await service.submit(payload(), { ipAddress: "203.0.113.5" });
    const second = await service.submit(payload(), { ipAddress: "203.0.113.6" });

    expect(second.publicReference).toBe(first.publicReference);
    expect(await service.listForAdmin(superAdminActor)).toHaveLength(1);
  });

  it("rejects a honeypot-filled submission", async () => {
    const { service } = await harness();

    await expect(
      service.submit(payload({ website: "https://spam.example" }), { ipAddress: "203.0.113.7" })
    ).rejects.toThrow(/invalid submission/i);

    expect(await service.listForAdmin(superAdminActor)).toHaveLength(0);
  });

  it("enforces the 3-per-hour rate limit per IP", async () => {
    const { service } = await harness();
    const ipAddress = "203.0.113.8";

    await service.submit(payload({ licenseNumber: "LIC-A", contactEmail: "a@example.com" }), { ipAddress });
    await service.submit(payload({ licenseNumber: "LIC-B", contactEmail: "b@example.com" }), { ipAddress });
    await service.submit(payload({ licenseNumber: "LIC-C", contactEmail: "c@example.com" }), { ipAddress });

    await expect(
      service.submit(payload({ licenseNumber: "LIC-D", contactEmail: "d@example.com" }), { ipAddress })
    ).rejects.toThrow(/rate limit/i);
  });

  it("never leaks the raw e-mail, phone or contact name in the response or the audit trail", async () => {
    const { service, audit } = await harness();

    const response = await service.submit(payload(), { ipAddress: "203.0.113.9" });
    const responseText = JSON.stringify(response);
    expect(responseText).not.toContain("awa.kone@example.com");
    expect(responseText).not.toContain("+2250102030405");
    expect(responseText).not.toContain("Awa Kone");

    const received = audit.search({ action: "partner_application.received" })[0];
    expect(received).toBeDefined();
    const auditText = JSON.stringify(received);
    expect(auditText).not.toContain("awa.kone@example.com");
    expect(auditText).not.toContain("+2250102030405");
    expect(typeof received?.context.contactEmailFingerprint).toBe("string");
    expect((received?.context.contactEmailFingerprint as string).length).toBeGreaterThan(10);
  });

  it("records a fingerprint without the raw e-mail on a duplicate-ignored audit row too", async () => {
    const { service, audit } = await harness();

    await service.submit(payload(), { ipAddress: "203.0.113.10" });
    await service.submit(payload(), { ipAddress: "203.0.113.11" });

    const duplicateEntries = audit.search({ action: "partner_application.duplicate_ignored" });
    expect(duplicateEntries).toHaveLength(1);
    expect(JSON.stringify(duplicateEntries[0])).not.toContain("awa.kone@example.com");
  });
});

describe("PartnerApplicationsService.listForAdmin", () => {
  it("refuses an actor without a compliance-read role", async () => {
    const { service } = await harness();
    await service.submit(payload(), { ipAddress: "203.0.113.20" });

    await expect(service.listForAdmin(unauthorizedActor)).rejects.toThrow(/rbac|denied/i);
  });

  it("returns rows for an authorised actor and audits the read", async () => {
    const { service, audit, country } = await harness();
    await service.submit(payload(), { ipAddress: "203.0.113.21" });

    const complianceActor: ActorContext = { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true };
    const rows = await service.listForAdmin(complianceActor, { countryId: country.id });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.countryId).toBe(country.id);
    expect((rows[0] as unknown as Record<string, unknown>).contactEmail).toBeUndefined();
    expect(audit.search({ action: "partner_application.admin_listed" })).toHaveLength(1);
  });

  it("refuses an admin_pays actor scoped to a different country", async () => {
    const { service, country } = await harness();
    await service.submit(payload(), { ipAddress: "203.0.113.22" });

    const otherCountryActor: ActorContext = {
      actorId: "admin-pays-1",
      roles: ["admin_pays"],
      mfaVerified: true,
      countryScopes: ["some-other-country-id"]
    };

    await expect(service.listForAdmin(otherCountryActor, { countryId: country.id })).rejects.toThrow(/rbac|denied/i);
  });
});
