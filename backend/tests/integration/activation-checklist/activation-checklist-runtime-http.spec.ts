import { afterEach, describe, expect, it } from "vitest";
import { activationChecklistResponseSchema, type ActivationChecklistResponse } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { ActivationChecklistAuditActions } from "../../../src/modules/activation-checklist/activation-checklist-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("activation checklist runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("returns read-only readiness sections and audits admin reads", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "activation-admin", roles: ["super_admin" as const], mfaVerified: true };
    await harness.runtime.featureFlags.service.setFlag({ key: "public_comparator_enabled", scopeType: "global", value: true, reason: "activation checklist test" }, admin);
    await harness.runtime.featureFlags.service.setFlag({ key: "quote_request_enabled", scopeType: "global", value: true, reason: "activation checklist test" }, admin);
    const country = await harness.runtime.countries.service.create({
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    }, admin);
    await harness.runtime.countries.service.update(country.id, {
      status: "public",
      flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true },
      reason: "activation checklist test"
    }, admin);
    const product = await harness.runtime.products.service.create({ key: "auto", name: "Assurance auto" }, admin);
    await harness.runtime.products.service.associateCountry(product.id, country.id, admin);
    await harness.runtime.products.service.update(product.id, {
      status: "public",
      flags: { product_public_enabled: true, product_comparison_enabled: true, product_quote_enabled: true },
      reason: "activation checklist test"
    }, admin);
    const consent = await harness.runtime.consent.service.createText({
      purpose: "lead_transmission",
      countryId: country.id,
      productId: product.id,
      channel: "public_web",
      recipientCategory: "courtier_partenaire_eligible",
      language: "fr",
      version: "v1",
      status: "draft",
      contentHash: "activation-checklist-consent"
    }, admin);
    await harness.runtime.consent.service.publishText(consent.id, admin);
    await harness.runtime.quoteForms.service.create({
      countryId: country.id,
      productId: product.id,
      language: "fr",
      version: "v1",
      status: "published",
      fields: [{ key: "usage", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
      consentTextId: consent.id,
      reason: "activation checklist test"
    }, admin);
    const partner = await harness.runtime.partners.service.create({
      legalName: "Broker Checklist",
      primaryEmail: "checklist@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);
    await harness.runtime.partners.service.authorizeCountry(partner.id, country.id, admin);
    await harness.runtime.partners.service.authorizeProduct(partner.id, product.id, admin);
    await harness.runtime.partnerLicenses.service.create({
      partnerTenantId: partner.id,
      licenseNumber: "LIC-CHECK",
      issuingAuthority: "Regulator",
      countryId: country.id,
      productIds: [product.id],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01"
    }, admin);
    const offer = await harness.runtime.offers.adminService.create({
      countryId: country.id,
      productId: product.id,
      partnerTenantId: partner.id,
      name: "Auto Checklist",
      indicativePriceMin: 10000,
      currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      reason: "activation checklist test"
    }, admin);
    await harness.runtime.offers.adminService.validate(offer.id, { validationStatus: "validated", reason: "activation checklist test" }, admin);

    const response = await harness.request("/admin/activation-checklist?country=CI&product=auto", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const checklist = activationChecklistResponseSchema.parse(await readJson<ActivationChecklistResponse>(response));
    expect(checklist.summary.blocked).toBe(0);
    expect(checklist.sections.map((section) => section.key)).toEqual(expect.arrayContaining(["global", `country:${country.id}`, `product:${product.id}`, `quote:${country.id}:${product.id}`, `partner:${partner.id}:${country.id}:${product.id}`, "offers"]));
    expect(harness.runtime.audit.writer.search({ action: ActivationChecklistAuditActions.read })[0]?.result).toBe("success");
  });

  it("refuses broker roles and audits the refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_starter" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000000801",
      partnerPlan: "starter" as const,
      mfaVerified: true
    };
    const response = await harness.request("/admin/activation-checklist", { headers: actorHeaders(broker) });
    expect(response.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: ActivationChecklistAuditActions.refused })[0]?.reason).toBe("forbidden_role");
  });

  it("blocks the checklist when a sensitive future flag is enabled", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "activation-admin", roles: ["super_admin" as const], mfaVerified: true };
    (harness.runtime.featureFlags.service as unknown as { flags: unknown[] }).flags.push({
      id: "bad-billing-flag",
      key: "billing_enabled",
      scopeType: "global",
      value: true,
      reason: "simulated bad persisted state",
      changedAt: new Date(),
      cacheVersion: 1
    });

    const response = await harness.request("/admin/activation-checklist", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const checklist = await readJson<ActivationChecklistResponse>(response);
    expect(checklist.summary.blocked).toBeGreaterThan(0);
    expect(checklist.sections.find((section) => section.key === "global")?.controls).toContainEqual(expect.objectContaining({
      key: "billing_enabled",
      status: "blocked"
    }));
  });

  it("refuses support admin and Admin Pays actors without explicit scopes", async () => {
    harness = await createRuntimeHttpHarness();
    const support = { actorId: "support", roles: ["support_admin" as const], mfaVerified: true };
    const adminPaysWithoutScope = { actorId: "admin-pays", roles: ["admin_pays" as const], mfaVerified: true };

    expect((await harness.request("/admin/activation-checklist", { headers: actorHeaders(support) })).status).toBe(403);
    expect((await harness.request("/admin/activation-checklist", { headers: actorHeaders(adminPaysWithoutScope) })).status).toBe(403);
    const reasons = harness.runtime.audit.writer.search({ action: ActivationChecklistAuditActions.refused }).map((entry) => entry.reason);
    expect(reasons).toEqual(expect.arrayContaining(["forbidden_role", "missing_country_scope"]));
  });
});
