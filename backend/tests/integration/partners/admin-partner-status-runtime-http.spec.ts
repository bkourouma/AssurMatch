import { afterEach, describe, expect, it } from "vitest";
import type { AdminPartnerDetailView, PartnerActivationBlocker } from "../../../../packages/shared/contracts/partner.contracts";
import type { ActivationChecklistResponse } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { adminPays, call, callJson, compliance, createPartner, prepareActivatablePartner, seedOnboardingRuntime, superAdmin } from "./partner-admin-http-helpers";

type Refusal = { code: string; blockers?: PartnerActivationBlocker[] };

/** Spec 051 US4 / T017: statuses, activation conditions, Actif test exclusion, suspension, Expiré. */
describe("partner statuses over HTTP (spec 051 US4)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lists every missing activation condition with 422 PARTNER_ACTIVATION_BLOCKED (US4 scenario 1)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.senegal.id);
    await callJson(harness, superAdmin, "POST", `/admin/partners/${partner.id}/status`, { status: "pending_compliance", reason: "envoi en verification" }, 200);
    const refused = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation sans conditions" });
    expect(refused.status).toBe(422);
    const body = await readJson<Refusal>(refused);
    expect(body.code).toBe("PARTNER_ACTIVATION_BLOCKED");
    expect(body.blockers?.map((blocker) => blocker.control)).toEqual([
      "license_valid_with_document",
      "coverage_country",
      "coverage_product",
      "owner_user",
      "contract_recorded",
      "country_broker_onboarding_enabled"
    ]);
    expect(body.blockers?.[0]).toMatchObject({ section: "partner", label: expect.any(String), evidence: expect.any(String) });
    const audit = harness.runtime.audit.writer.search({ action: "partner.status_change_refused", result: "refused" })[0];
    expect(audit?.reason).toBe("activation_blocked");
    expect((await harness.runtime.partners.service.require(partner.id)).status).toBe("pending_compliance");
  });

  it("activates in Actif public with history once every condition is met", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner: ready } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    const before = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${ready.id}`, undefined, 200);
    expect(before.activationBlockers).toEqual([]);
    expect(before.allowedTransitions).toEqual(["active_test", "active", "retired"]);

    const activated = await callJson<AdminPartnerDetailView>(harness, compliance, "POST", `/admin/partners/${ready.id}/status`, { status: "active", reason: "activation apres verification" }, 200);
    expect(activated).toMatchObject({ status: "active", effectiveStatus: "active", statusReason: "activation apres verification" });
    expect(activated.statusHistory.map((entry) => entry.toStatus)).toEqual(["draft", "pending_compliance", "active"]);
    expect(activated.statusHistory[2]).toMatchObject({ fromStatus: "pending_compliance", actorId: compliance.actorId, reason: "activation apres verification" });
    expect((await harness.runtime.leads.eligibility.evaluate(ready.id, seed.country.id, seed.product.id)).eligible).toBe(true);
    expect(harness.runtime.audit.writer.search({ action: "partner.status_changed", targetId: ready.id }).length).toBe(2);
  });

  it("names the single missing condition when the country onboarding flag is closed", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    expect(await harness.runtime.partnerAdmin.activationBlockers(partner.id)).toEqual([]);
    // Closing the country onboarding flag brings back exactly that blocker.
    const country = await harness.runtime.countries.service.require(seed.country.id);
    await harness.runtime.countries.service.update(country.id, { status: country.status, flags: { ...country.flags, country_broker_onboarding_enabled: false }, reason: "fermeture onboarding" }, superAdmin);
    const refused = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active_test", reason: "activation pays ferme" });
    expect(refused.status).toBe(422);
    expect((await readJson<Refusal>(refused)).blockers?.map((blocker) => blocker.control)).toEqual(["country_broker_onboarding_enabled"]);
  });

  it("reserves activation to compliance; the Admin Pays only sends to review (US4 scenario 2)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const ci = adminPays(seed.country.id);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    const refused = await call(harness, ci, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation par admin pays" });
    expect(refused.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "partner.status_change_refused", result: "refused" })[0]?.reason).toBe("status_change_requires_compliance");
    expect((await call(harness, ci, "POST", `/admin/partners/${partner.id}/status`, { status: "retired", reason: "resiliation par admin pays" })).status).toBe(403);

    const draft = await createPartner(harness, ci, seed.country.id);
    expect((await call(harness, ci, "POST", `/admin/partners/${draft.id}/status`, { status: "pending_compliance", reason: "dossier envoye en verification" })).status).toBe(200);
  });

  it("refuses transitions outside the graph with 409 PARTNER_TRANSITION_INVALID", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const skipped = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation directe depuis prospect" });
    expect(skipped.status).toBe(409);
    expect((await readJson<Refusal>(skipped)).code).toBe("PARTNER_TRANSITION_INVALID");
    expect((await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "suspended", reason: "suspension d'un prospect" })).status).toBe(409);
  });

  it("never routes, lists or shows offers of an Actif test partner (US4 scenario 3, D-6)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active_test", reason: "phase de test" }, 200);

    const routing = await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id);
    expect(routing).toMatchObject({ eligible: false, reasons: ["partner_not_active"] });
    expect((await harness.runtime.partnerEligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(false);
    expect((await harness.runtime.publicOfferPartnerEligibility(partner.id, seed.country.id, seed.product.id)).eligible).toBe(false);
    const directory = await readJson<Array<{ id: string }>>(await harness.request("/countries/CI/partners"));
    expect(directory.map((item) => item.id)).toEqual([seed.partner.id]);
    expect((await harness.request(`/countries/CI/partners/${partner.id}`)).status).toBe(404);

    // Actif test <-> Actif public goes through the conditions again.
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "ouverture publique" }, 200);
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(true);
  });

  it("suspends with immediate exclusion from routing and offers, then reactivates to the previous status (US4 scenario 4)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation apres verification" }, 200);
    const suspended = await callJson<AdminPartnerDetailView>(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "suspended", reason: "incident de conformite" }, 200);
    expect(suspended).toMatchObject({ status: "suspended", previousActiveStatus: "active", statusReason: "incident de conformite" });
    expect(suspended.allowedTransitions).toEqual(["active", "retired"]);
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(false);
    expect((await harness.runtime.publicOfferPartnerEligibility(partner.id, seed.country.id, seed.product.id)).eligible).toBe(false);
    // Only the previous active status is a valid reactivation target.
    expect((await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active_test", reason: "reactivation en test" })).status).toBe(409);
    const reactivated = await callJson<AdminPartnerDetailView>(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "incident clos" }, 200);
    expect(reactivated.status).toBe("active");
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(true);
  });

  it("refuses a reactivation when a condition is no longer met (US4 scenario 7)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner, license } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation apres verification" }, 200);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "suspended", reason: "incident de conformite" }, 200);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/revoke`, { reason: "licence retiree par le regulateur" }, 200);
    const refused = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "tentative de reactivation" });
    expect(refused.status).toBe(422);
    expect((await readJson<Refusal>(refused)).blockers?.map((blocker) => blocker.control)).toEqual(expect.arrayContaining(["license_valid_with_document"]));
  });

  it("computes Expiré without a job when every valid licence has expired (US4 scenario 6, FR-006)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner, license } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation apres verification" }, 200);
    // Time passes: the stored licence is still `valid` but its date is behind us.
    const stored = await harness.runtime.partnerLicenses.service.require(license.id);
    stored.expirationDate = "2026-01-02";
    const detail = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${partner.id}`, undefined, 200);
    expect(detail.status).toBe("active");
    expect(detail.effectiveStatus).toBe("expired");
    expect(detail.licenses[0]?.effectiveStatus).toBe("expired");
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).reasons).toContain("license_not_valid_for_scope");
    const expired = await callJson<Array<{ id: string }>>(harness, superAdmin, "GET", "/admin/partners?status=expired", undefined, 200);
    expect(expired.map((item) => item.id)).toEqual([partner.id]);
  });

  it("retires as a terminal status; nothing changes afterwards", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const retired = await callJson<AdminPartnerDetailView>(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "retired", reason: "fin du partenariat" }, 200);
    expect(retired.allowedTransitions).toEqual([]);
    expect((await call(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "pending_compliance", reason: "reprise du dossier" })).status).toBe(409);
    const update = await call(harness, superAdmin, "PATCH", `/admin/partners/${partner.id}`, { city: "Bouake", reason: "modification apres resiliation" });
    expect(update.status).toBe(422);
    expect((await readJson<Refusal>(update)).code).toBe("PARTNER_RETIRED");
  });

  it("feeds the activation checklist: only Actif public partners with an accepted proof count (FR-027, R14)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active_test", reason: "phase de test" }, 200);
    // Park the seeded partner: the only remaining candidate is in Actif test.
    await harness.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "isolation du test checklist", superAdmin);
    const blockers = await harness.runtime.activationChecklist.service.countryActivationBlockers(seed.country.id);
    expect(blockers.map((blocker) => blocker.control)).toContain("country_active_licensed_partner");
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "ouverture publique" }, 200);
    expect((await harness.runtime.activationChecklist.service.countryActivationBlockers(seed.country.id)).map((blocker) => blocker.control)).not.toContain("country_active_licensed_partner");

    const response = await call(harness, superAdmin, "GET", `/admin/activation-checklist?country=CI&product=auto&partnerId=${partner.id}`);
    const checklist = await readJson<ActivationChecklistResponse>(response);
    const section = checklist.sections.find((candidate) => candidate.key === `partner:${partner.id}:${seed.country.id}:${seed.product.id}`);
    expect(section?.controls.map((control) => [control.key, control.status])).toEqual(expect.arrayContaining([
      ["partner_document_accepted", "passed"],
      ["partner_owner_user", "passed"],
      ["partner_contract", "passed"]
    ]));
  });
});
