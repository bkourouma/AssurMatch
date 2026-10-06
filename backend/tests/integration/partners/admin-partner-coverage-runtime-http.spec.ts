import { afterEach, describe, expect, it } from "vitest";
import type { AdminPartnerDetailView } from "../../../../packages/shared/contracts/partner.contracts";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { adminPays, call, callJson, compliance, createLicense, createPartner, prepareActivatablePartner, seedOnboardingRuntime, superAdmin } from "./partner-admin-http-helpers";

/** Spec 051 US3 / T014: country and product coverage, withdrawal, scope. */
describe("partner coverage over HTTP (spec 051 US3)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("refuses a country authorization without any licence of the partner for that country (US3 scenario 1)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const refused = await call(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/countries`, { countryId: seed.country.id, reason: "couverture sans licence" });
    expect(refused.status).toBe(422);
    expect((await readJson<{ code: string }>(refused)).code).toBe("LICENSE_REQUIRED_FOR_COUNTRY");
    expect(harness.runtime.audit.writer.search({ action: "partner.country_authorization_refused", result: "refused" })[0]?.reason).toBe("license_required_for_country");

    // A draft licence is enough to prepare the coverage.
    await createLicense(harness, superAdmin, partner.id, seed.country.id, [seed.product.id]);
    const authorized = await callJson<AdminPartnerDetailView>(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/countries`, { countryId: seed.country.id, reason: "couverture pays du pilote" }, 201);
    expect(authorized.coverage.countries).toEqual([expect.objectContaining({ scopeId: seed.country.id, status: "active", withdrawnAt: null })]);
    const product = await callJson<AdminPartnerDetailView>(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/products`, { productId: seed.product.id, reason: "couverture produit du pilote" }, 201);
    expect(product.coverage.products).toEqual([expect.objectContaining({ scopeId: seed.product.id, status: "active" })]);
    expect(harness.runtime.audit.writer.search({ action: "partner.country_authorized", targetId: partner.id })[0]?.reason).toBe("couverture pays du pilote");
  });

  it("withdraws a product authorization immediately, without touching assigned leads (US3 scenario 2)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation apres verification" }, 200);
    const candidatesBefore = await harness.runtime.leads.eligibility.candidates(seed.country.id, seed.product.id);
    expect(candidatesBefore.find((candidate) => candidate.partner.id === partner.id)?.eligible).toBe(true);
    const assignmentsBefore = (await harness.runtime.leads.assignments.list()).length;

    const withdrawn = await callJson<AdminPartnerDetailView>(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/products/${seed.product.id}/withdraw`, { reason: "produit retire du contrat" }, 200);
    expect(withdrawn.coverage.products[0]).toMatchObject({ status: "withdrawn", withdrawalReason: "produit retire du contrat" });
    expect(withdrawn.coverage.products[0]?.withdrawnAt).not.toBeNull();
    const candidatesAfter = await harness.runtime.leads.eligibility.candidates(seed.country.id, seed.product.id);
    expect(candidatesAfter.find((candidate) => candidate.partner.id === partner.id)?.reasons).toContain("partner_product_not_authorized");
    expect((await harness.runtime.leads.assignments.list()).length).toBe(assignmentsBefore);
    expect(harness.runtime.audit.writer.search({ action: "partner.product_authorization_withdrawn", targetId: partner.id })[0]?.reason).toBe("produit retire du contrat");
    // Withdrawing twice finds nothing active.
    expect((await call(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/products/${seed.product.id}/withdraw`, { reason: "second retrait" })).status).toBe(404);

    // The country withdrawal is immediate too.
    await callJson(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/countries/${seed.country.id}/withdraw`, { reason: "sortie du pays" }, 200);
    expect(await harness.runtime.partners.service.isAuthorizedForCountry(partner.id, seed.country.id)).toBe(false);
  });

  it("refuses an Admin Pays authorizing a partner outside its scope (US3 scenario 3)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const ci = adminPays(seed.country.id);
    const partner = await createPartner(harness, ci, seed.country.id);
    await createLicense(harness, superAdmin, partner.id, seed.senegal.id, []);
    const refused = await call(harness, ci, "POST", `/admin/partners/${partner.id}/authorizations/countries`, { countryId: seed.senegal.id, reason: "autorisation senegal" });
    expect(refused.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "partner.country_authorization_refused", result: "refused" })[0]?.reason).toBe("rbac_denied");
    // A licence in another country is also out of the Admin Pays scope.
    expect((await call(harness, ci, "POST", `/admin/partners/${partner.id}/licenses`, {
      licenseNumber: "LIC-SN-1", issuingAuthority: "Regulateur SN", countryId: seed.senegal.id, productIds: [], effectiveDate: "2026-01-01", expirationDate: "2030-01-01", reason: "licence senegal"
    })).status).toBe(403);
    // Within its own country the Admin Pays prepares the coverage.
    await createLicense(harness, ci, partner.id, seed.country.id, []);
    expect((await call(harness, ci, "POST", `/admin/partners/${partner.id}/authorizations/countries`, { countryId: seed.country.id, reason: "autorisation cote d'ivoire" })).status).toBe(201);
  });
});
