import { afterEach, describe, expect, it } from "vitest";
import type { AdminCountryView, CatalogActivationBlocker } from "../../../../packages/shared/contracts/catalog.contracts";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { auditEntries, call, complianceAdmin, countryAdmin, senegal, superAdmin, supportAdmin } from "./catalog-http-helpers";

type ErrorBody = { code: string; message: string; blockers?: CatalogActivationBlocker[] };

describe("admin countries over HTTP (spec 050 US1)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function createSenegal(h: RuntimeHttpHarness): Promise<AdminCountryView> {
    const created = await call<AdminCountryView>(h, superAdmin, "POST", "/admin/countries", senegal);
    expect(created.status).toBe(201);
    return created.body;
  }

  it("creates, lists, reads and edits a country with an audited before/after", async () => {
    harness = await createRuntimeHttpHarness();
    const created = await createSenegal(harness);
    expect(created.status).toBe("draft");
    expect(Object.values(created.flags).every((value) => value === false)).toBe(true);
    expect(created.phoneDialCode).toBe("+221");
    expect(created.phoneNationalLengths).toEqual([9]);
    expect(auditEntries(harness, "country.created", "success").at(-1)?.reason).toBe("ouverture SC-01 Senegal");

    const listed = await call<AdminCountryView[]>(harness, superAdmin, "GET", "/admin/countries");
    expect(listed.status).toBe(200);
    expect(listed.body.map((country) => country.isoCode)).toContain("SN");

    const detail = await call<AdminCountryView>(harness, superAdmin, "GET", `/admin/countries/${created.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.links).toEqual([]);
    expect(detail.body.checklist?.ready).toBe(false);

    const updated = await call<AdminCountryView>(harness, superAdmin, "PATCH", `/admin/countries/${created.id}`, {
      currency: "XAF",
      languages: ["fr"],
      expectedUpdatedAt: created.updatedAt,
      reason: "correction de la devise"
    });
    expect(updated.status).toBe(200);
    expect(updated.body.currency).toBe("XAF");
    const entry = auditEntries(harness, "country.updated", "success").at(-1);
    expect(entry?.reason).toBe("correction de la devise");
    expect((entry?.context.before as { currency: string }).currency).toBe("XOF");
    expect((entry?.context.after as { currency: string }).currency).toBe("XAF");

    const duplicate = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/countries", senegal);
    expect(duplicate.status).toBe(409);
  });

  it("refuses a mutation without a reason and refuses flags or status through PATCH", async () => {
    harness = await createRuntimeHttpHarness();
    const created = await createSenegal(harness);
    const noReason = await call(harness, superAdmin, "PATCH", `/admin/countries/${created.id}`, { currency: "XAF" });
    expect(noReason.status).toBe(400);
    const sneaky = await call<AdminCountryView>(harness, superAdmin, "PATCH", `/admin/countries/${created.id}`, {
      status: "public",
      flags: { country_public_enabled: true },
      reason: "tentative de contournement"
    });
    expect(sneaky.status).toBe(200);
    expect(sneaky.body.status).toBe("draft");
    expect(sneaky.body.flags.country_public_enabled).toBe(false);
  });

  it("refuses an out-of-scope country admin, audits the refusal and changes nothing", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const sn = await createSenegal(harness);
    const ciAdmin = countryAdmin(seed.country.id);

    const refused = await call<ErrorBody>(harness, ciAdmin, "PATCH", `/admin/countries/${sn.id}`, { currency: "XAF", reason: "hors perimetre CI" });
    expect(refused.status).toBe(403);
    expect(auditEntries(harness, "country.update_refused", "refused").some((entry) => entry.targetId === sn.id)).toBe(true);
    expect((await harness.runtime.countries.service.require(sn.id)).currency).toBe("XOF");

    const flag = await call(harness, ciAdmin, "POST", `/admin/countries/${sn.id}/flags`, { key: "country_comparison_enabled", value: true, reason: "hors perimetre CI" });
    expect(flag.status).toBe(403);
    expect(auditEntries(harness, "country.flag_changed", "refused").some((entry) => entry.targetId === sn.id)).toBe(true);

    const detail = await call(harness, ciAdmin, "GET", `/admin/countries/${sn.id}`);
    expect(detail.status).toBe(403);
    const listed = await call<AdminCountryView[]>(harness, ciAdmin, "GET", "/admin/countries");
    expect(listed.body.map((country) => country.isoCode)).toEqual(["CI"]);

    const support = await call(harness, supportAdmin, "GET", "/admin/countries");
    expect(support.status).toBe(403);
  });

  it("moves a country to internal and toggles a non-sensitive flag with history (independent test)", async () => {
    harness = await createRuntimeHttpHarness();
    const sn = await createSenegal(harness);
    const snAdmin = countryAdmin(sn.id);

    const status = await call<AdminCountryView>(harness, snAdmin, "POST", `/admin/countries/${sn.id}/status`, { status: "internal", reason: "preparation interne" });
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("internal");
    expect(auditEntries(harness, "country.status_changed", "success").at(-1)?.context).toMatchObject({ before: { status: "draft" }, after: { status: "internal" } });

    const toggled = await call<AdminCountryView>(harness, snAdmin, "POST", `/admin/countries/${sn.id}/flags`, { key: "country_comparison_enabled", value: true, reason: "ouverture comparaison" });
    expect(toggled.status).toBe(200);
    expect(toggled.body.flags.country_comparison_enabled).toBe(true);
    const flag = harness.runtime.featureFlags.service.list().find((candidate) => candidate.key === "country_comparison_enabled" && candidate.scopeType === "country" && candidate.scopeId === sn.id);
    expect(flag?.value).toBe(true);
    expect(harness.runtime.featureFlags.service.historyFor(flag!.id)).toHaveLength(1);
    expect(auditEntries(harness, "country.flag_changed", "success").at(-1)?.context).toMatchObject({ key: "country_comparison_enabled", before: { country_comparison_enabled: false }, after: { country_comparison_enabled: true } });

    // The public site stays closed while country_public_enabled is off.
    expect((await harness.request("/countries/SN")).status).toBe(404);
  });

  it("refuses public activation while the checklist has blockers, and lists them", async () => {
    harness = await createRuntimeHttpHarness();
    const sn = await createSenegal(harness);

    const flag = await call<ErrorBody>(harness, complianceAdmin, "POST", `/admin/countries/${sn.id}/flags`, { key: "country_public_enabled", value: true, reason: "ouverture publique SN" });
    expect(flag.status).toBe(422);
    expect(flag.body.code).toBe("ACTIVATION_BLOCKED");
    const controls = flag.body.blockers?.map((blocker) => blocker.control) ?? [];
    expect(controls).toEqual(expect.arrayContaining(["country_regime", "country_active_licensed_partner", "publishable_offer"]));
    expect(controls).not.toContain("country_public_enabled");
    expect(controls).not.toContain("country_status_public");
    expect(auditEntries(harness, "country.flag_changed", "refused").at(-1)?.reason).toBe("activation_blocked");

    const status = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/countries/${sn.id}/status`, { status: "public", reason: "ouverture publique SN" });
    expect(status.status).toBe(422);
    expect(status.body.code).toBe("ACTIVATION_BLOCKED");
    expect((await harness.runtime.countries.service.require(sn.id)).flags.country_public_enabled).toBe(false);
  });

  it("reserves public activation to compliance or super admin", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const ciAdmin = countryAdmin(seed.country.id);
    // Close the country first: deactivation is free, even for the country admin.
    const closed = await call<AdminCountryView>(harness, ciAdmin, "POST", `/admin/countries/${seed.country.id}/flags`, { key: "country_public_enabled", value: false, reason: "fermeture temporaire" });
    expect(closed.status).toBe(200);
    expect((await harness.request("/countries/CI")).status).toBe(404);

    const refused = await call<ErrorBody>(harness, ciAdmin, "POST", `/admin/countries/${seed.country.id}/flags`, { key: "country_public_enabled", value: true, reason: "reouverture par admin pays" });
    expect(refused.status).toBe(403);
    expect(auditEntries(harness, "country.flag_changed", "refused").at(-1)?.reason).toBe("public_activation_requires_compliance");

    const refusedStatus = await call(harness, ciAdmin, "POST", `/admin/countries/${seed.country.id}/status`, { status: "public", reason: "reouverture par admin pays" });
    expect(refusedStatus.status).toBe(403);

    // The seeded country meets every checklist condition: compliance reopens it.
    const reopened = await call<AdminCountryView>(harness, complianceAdmin, "POST", `/admin/countries/${seed.country.id}/flags`, { key: "country_public_enabled", value: true, reason: "reouverture conformite" });
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    expect((await harness.request("/countries/CI")).status).toBe(200);
  });

  it("suspends a public country at once and blocks the public journey", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    expect((await harness.request("/countries")).status).toBe(200);
    expect((await harness.request("/countries/CI")).status).toBe(200);

    const suspended = await call<AdminCountryView>(harness, countryAdmin(seed.country.id), "POST", `/admin/countries/${seed.country.id}/status`, { status: "suspended", reason: "incident conformite" });
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe("suspended");
    expect((await harness.request("/countries/CI")).status).toBe(404);
    expect((await harness.request(`/countries/CI/products/${seed.product.key}/quote-form`)).status).not.toBe(200);
    expect(auditEntries(harness, "country.status_changed", "success").at(-1)?.reason).toBe("incident conformite");

    const retiredToPublic = await call(harness, superAdmin, "POST", `/admin/countries/${seed.country.id}/status`, { status: "retired", reason: "retrait definitif" });
    expect(retiredToPublic.status).toBe(200);
    const back = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/countries/${seed.country.id}/status`, { status: "internal", reason: "retour impossible" });
    expect(back.status).toBe(409);
  });

  it("refuses AI and sensitive flags with the compliance procedure message", async () => {
    harness = await createRuntimeHttpHarness();
    const sn = await createSenegal(harness);
    const refused = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/countries/${sn.id}/flags`, { key: "country_ai_enabled", value: true, reason: "activation ia pays" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("CATALOG_FLAG_NOT_TOGGLEABLE");
    expect(refused.body.message).toMatch(/compliance procedure/);
    expect(auditEntries(harness, "country.flag_changed", "refused").at(-1)?.reason).toBe("flag_not_toggleable");
    expect((await harness.runtime.countries.service.require(sn.id)).flags.country_ai_enabled).toBe(false);
  });

  it("refuses a stale write with 409 instead of overwriting", async () => {
    harness = await createRuntimeHttpHarness();
    const sn = await createSenegal(harness);
    const first = await call<AdminCountryView>(harness, superAdmin, "PATCH", `/admin/countries/${sn.id}`, { name: "Republique du Senegal", expectedUpdatedAt: sn.updatedAt, reason: "premier admin" });
    expect(first.status).toBe(200);
    // Same timestamp precision: make sure the second write sees a different updatedAt.
    const second = await call<ErrorBody>(harness, superAdmin, "PATCH", `/admin/countries/${sn.id}`, { name: "Senegal (bis)", expectedUpdatedAt: "2000-01-01T00:00:00.000Z", reason: "second admin" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CATALOG_UPDATE_CONFLICT");
    expect((await harness.runtime.countries.service.require(sn.id)).name).toBe("Republique du Senegal");
    expect(auditEntries(harness, "country.update_refused", "refused").at(-1)?.reason).toBe("stale_version");
  });

  it("adds the active licensed partner control to the activation checklist (T009)", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await createSenegal(harness);
    const checklist = await harness.runtime.activationChecklist.service.read(superAdmin, {});
    const control = (code: string) => checklist.sections
      .find((section) => section.scope.countryCode === code && section.key.startsWith("country:"))
      ?.controls.find((candidate) => candidate.key === "country_active_licensed_partner");
    expect(control("CI")).toMatchObject({ status: "passed", blocking: true });
    expect(control("SN")).toMatchObject({ status: "blocked", blocking: true });
  });

  it("requires MFA on every catalogue route", async () => {
    harness = await createRuntimeHttpHarness();
    const noMfa = await call(harness, { ...superAdmin, mfaVerified: false }, "GET", "/admin/countries");
    expect([401, 403]).toContain(noMfa.status);
    const anonymous = await harness.request("/admin/countries");
    expect(anonymous.status).toBe(401);
  });
});
