import { afterEach, describe, expect, it } from "vitest";
import type { AdminPartnerDetailView, AdminPartnerView } from "../../../../packages/shared/contracts/partner.contracts";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { adminPays, call, callJson, compliance, createLicense, createPartner, partnerPayload, seedOnboardingRuntime, superAdmin, support } from "./partner-admin-http-helpers";

/** Spec 051 US1 / T008: partner CRUD, duplicate RCCM, Admin Pays scope, optimistic concurrency. */
describe("admin partners over HTTP (spec 051 US1)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("creates a partner as Prospect with every identity field, history and an audit log", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const created = await createPartner(harness, superAdmin, seed.country.id, { status: "active" });

    expect(created.status).toBe("draft");
    expect(created.effectiveStatus).toBe("draft");
    expect(created).toMatchObject({
      countryId: seed.country.id,
      city: "Abidjan",
      plan: "pro",
      quotaMonthlyLeads: 25,
      slaTargetMinutes: 60,
      partnerInsurers: ["Assureur A", "Assureur B"],
      adminContactName: "Awa Admin",
      commercialContactName: "Koffi Commercial"
    });
    expect(created.statusHistory).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "draft" })]);
    expect(created.activationBlockers.map((blocker) => blocker.control)).toEqual(expect.arrayContaining(["license_valid_with_document", "coverage_country", "coverage_product", "owner_user", "contract_recorded"]));
    expect(created.allowedTransitions).toEqual(["pending_compliance", "retired"]);
    expect(harness.runtime.audit.writer.search({ action: "partner.created", targetId: created.id })[0]?.result).toBe("success");
    // The new partner is never routable.
    expect((await harness.runtime.leads.eligibility.evaluate(created.id, seed.country.id, seed.product.id)).eligible).toBe(false);

    const list = await callJson<AdminPartnerView[]>(harness, superAdmin, "GET", "/admin/partners", undefined, 200);
    expect(list.map((partner) => partner.id)).toContain(created.id);
    const detail = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${created.id}`, undefined, 200);
    expect(detail.id).toBe(created.id);
    // The static routes registered before `partners/:id` keep answering.
    expect((await call(harness, superAdmin, "GET", "/admin/partners/sla")).status).toBe(200);
    expect((await call(harness, superAdmin, "GET", "/admin/partners/applications")).status).toBe(200);
  });

  it("requires a reason and refuses invalid input", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    expect((await call(harness, superAdmin, "POST", "/admin/partners", partnerPayload(seed.country.id, { reason: "court" }))).status).toBe(400);
    expect((await call(harness, superAdmin, "POST", "/admin/partners", partnerPayload(seed.country.id, { slaTargetMinutes: 1 }))).status).toBe(400);
    expect((await call(harness, superAdmin, "GET", "/admin/partners/not-a-uuid")).status).toBe(400);
  });

  it("refuses a duplicate registration number in the same country (FR-002)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    await createPartner(harness, superAdmin, seed.country.id, { registrationNumber: "CI-DUP-1" });
    const duplicate = await call(harness, superAdmin, "POST", "/admin/partners", partnerPayload(seed.country.id, { registrationNumber: "ci-dup-1" }));
    expect(duplicate.status).toBe(409);
    expect((await readJson<{ code: string }>(duplicate)).code).toBe("PARTNER_DUPLICATE_REGISTRATION");
    // Same RCCM in another country is a different registry.
    expect((await call(harness, superAdmin, "POST", "/admin/partners", partnerPayload(seed.senegal.id, { registrationNumber: "CI-DUP-1" }))).status).toBe(201);
    expect(harness.runtime.audit.writer.search({ action: "partner.create_refused", result: "refused" }).some((entry) => entry.reason === "duplicate_registration_number")).toBe(true);
  });

  it("limits the Admin Pays to its own countries, refused and audited (US1 scenario 2)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const ci = adminPays(seed.country.id);
    const own = await createPartner(harness, ci, seed.country.id);
    expect(own.status).toBe("draft");

    const outOfScope = await call(harness, ci, "POST", "/admin/partners", partnerPayload(seed.senegal.id));
    expect(outOfScope.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "partner.create_refused", result: "refused" }).some((entry) => entry.reason === "rbac_denied")).toBe(true);

    const senegalPartner = await createPartner(harness, superAdmin, seed.senegal.id);
    expect((await call(harness, ci, "GET", `/admin/partners/${senegalPartner.id}`)).status).toBe(403);
    expect((await call(harness, ci, "PATCH", `/admin/partners/${senegalPartner.id}`, { quotaMonthlyLeads: 3, reason: "hors perimetre test" })).status).toBe(403);
    // Moving an own partner to another country is also out of scope.
    expect((await call(harness, ci, "PATCH", `/admin/partners/${own.id}`, { countryId: seed.senegal.id, reason: "changement de pays" })).status).toBe(403);
    const list = await callJson<AdminPartnerView[]>(harness, ci, "GET", "/admin/partners", undefined, 200);
    expect(list.map((partner) => partner.id)).toContain(own.id);
    expect(list.map((partner) => partner.id)).not.toContain(senegalPartner.id);
    // The seeded legacy partner has no country: a scoped admin never sees it.
    expect(list.map((partner) => partner.id)).not.toContain(seed.partner.id);
    // The SLA overview follows the same country scope now that the Admin Pays reads partners.
    const sla = await callJson<Array<{ partnerTenantId: string }>>(harness, ci, "GET", "/admin/partners/sla", undefined, 200);
    expect(sla.map((row) => row.partnerTenantId)).toEqual([own.id]);
  });

  it("updates plan, quota and SLA with before/after audit; the new quota applies to routing (US1 scenario 4)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const created = await createPartner(harness, superAdmin, seed.country.id);
    const updated = await callJson<AdminPartnerDetailView>(harness, superAdmin, "PATCH", `/admin/partners/${created.id}`, {
      plan: "enterprise", quotaMonthlyLeads: 3, slaTargetMinutes: 30, expectedUpdatedAt: created.updatedAt, reason: "renegociation commerciale"
    }, 200);
    expect(updated).toMatchObject({ plan: "enterprise", quotaMonthlyLeads: 3, slaTargetMinutes: 30, legalName: created.legalName });
    expect((await harness.runtime.partners.service.require(created.id)).quotaMonthlyLeads).toBe(3);
    const audit = harness.runtime.audit.writer.search({ action: "partner.updated", targetId: created.id })[0];
    expect(audit?.reason).toBe("renegociation commerciale");
    expect(audit?.context).toMatchObject({ before: expect.objectContaining({ plan: "pro", quotaMonthlyLeads: 25 }), after: expect.objectContaining({ plan: "enterprise", quotaMonthlyLeads: 3 }) });
  });

  it("refuses a concurrent update with 409 (FR-026)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const created = await createPartner(harness, superAdmin, seed.country.id);
    await callJson(harness, superAdmin, "PATCH", `/admin/partners/${created.id}`, { city: "Bouake", expectedUpdatedAt: created.updatedAt, reason: "premiere modification" }, 200);
    const stale = await call(harness, superAdmin, "PATCH", `/admin/partners/${created.id}`, { city: "Yamoussoukro", expectedUpdatedAt: created.updatedAt, reason: "seconde modification" });
    expect(stale.status).toBe(409);
    expect((await readJson<{ code: string }>(stale)).code).toBe("PARTNER_UPDATE_CONFLICT");
  });

  it("lets the Support Admin read but never write, and keeps unauthenticated or non-MFA callers out", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const created = await createPartner(harness, superAdmin, seed.country.id);
    expect((await call(harness, support, "GET", "/admin/partners")).status).toBe(200);
    expect((await call(harness, support, "GET", `/admin/partners/${created.id}`)).status).toBe(200);
    expect((await call(harness, support, "POST", "/admin/partners", partnerPayload(seed.country.id))).status).toBe(403);
    expect((await call(harness, support, "PATCH", `/admin/partners/${created.id}`, { city: "Bouake", reason: "tentative support" })).status).toBe(403);
    expect((await call(harness, { ...superAdmin, mfaVerified: false }, "GET", "/admin/partners")).status).toBe(403);
    expect((await harness.request("/admin/partners")).status).toBe(401);
    const broker = { actorId: "broker", roles: ["broker_owner_pro" as const], partnerTenantId: created.id, mfaVerified: true };
    expect((await call(harness, broker, "GET", "/admin/partners")).status).toBe(403);
  });

  it("filters the directory by status, country, plan and licence expiring soon (US7)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const soon = await createPartner(harness, superAdmin, seed.country.id, { plan: "starter" });
    const later = await createPartner(harness, superAdmin, seed.country.id);
    await createPartner(harness, superAdmin, seed.senegal.id);
    const inTwentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const [partner, expirationDate] of [[soon, inTwentyDays], [later, "2030-01-01"]] as const) {
      const license = await createLicense(harness, superAdmin, partner.id, seed.country.id, [seed.product.id], { expirationDate });
      await harness.runtime.partnerLicenses.service.changeStatus(license.id, "valid", "fixture valid licence", compliance);
    }
    const expiring = await callJson<AdminPartnerView[]>(harness, superAdmin, "GET", "/admin/partners?licenseExpiringWithinDays=30", undefined, 200);
    expect(expiring.map((partner) => partner.id)).toEqual([soon.id]);
    expect(expiring[0]?.nextLicenseExpiration).toBe(inTwentyDays);
    const starters = await callJson<AdminPartnerView[]>(harness, superAdmin, "GET", `/admin/partners?plan=starter&countryId=${seed.country.id}`, undefined, 200);
    expect(starters.map((partner) => partner.id)).toEqual([soon.id]);
    const drafts = await callJson<AdminPartnerView[]>(harness, superAdmin, "GET", `/admin/partners?status=draft&countryId=${seed.senegal.id}`, undefined, 200);
    expect(drafts).toHaveLength(1);
  });
});
