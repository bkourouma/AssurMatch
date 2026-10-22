import { afterEach, describe, expect, it } from "vitest";
import type { AiScopeFlagChangeResult, AiScopeFlagsOverview } from "../../../../packages/shared/contracts/ai-scope-flags.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 7 / spec 074: GET and POST /admin/ai/scope-flags, the audited path of the country and product AI flags.
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const superAdminNoMfa: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: false };
const aiAdmin: ActorContext = { actorId: "ai-admin", roles: ["ai_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };
const ACTIVATION = { reference: "POLICY-AI-074", approvedBy: "compliance-officer", reason: "Activation IA approuvee par la conformite" };

describe("admin AI scope flags runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  function post(actor: ActorContext, body: unknown) {
    return harness!.request("/admin/ai/scope-flags", { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
  }

  it("refuses an anonymous or MFA-less caller and lists the seeded scopes for a super admin", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    expect((await harness.request("/admin/ai/scope-flags")).status).toBe(401);
    expect((await harness.request("/admin/ai/scope-flags", { headers: actorHeaders(superAdminNoMfa) })).status).toBe(403);
    expect((await post(superAdminNoMfa, { scopeType: "country", scopeId: seed.country.id, key: "country_ai_enabled", value: false, reason: "Fermeture rapide sans MFA" })).status).toBe(403);

    const response = await harness.request("/admin/ai/scope-flags", { headers: actorHeaders(superAdmin) });
    expect(response.status).toBe(200);
    const overview = await readJson<AiScopeFlagsOverview>(response);
    expect(overview.countries).toEqual([{ id: seed.country.id, code: "CI", name: "Cote d'Ivoire", flags: { country_ai_enabled: false } }]);
    expect(overview.products).toHaveLength(1);
    expect(overview.products[0]).toMatchObject({ id: seed.product.id, key: "auto", flags: { product_ai_scoring_enabled: false, product_ai_form_assistant_enabled: false } });
    expect(overview.globalFlags.map((flag) => flag.key)).toContain("ai_summary_enabled");
    expect(overview.globalFlags.every((flag) => typeof flag.value === "boolean")).toBe(true);
    expect(overview.history).toEqual([]);
  });

  it("activates a country flag for a super admin with a policy reference, audits it and keeps the generic routes closed", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const body = { scopeType: "country", scopeId: seed.country.id, key: "country_ai_enabled", value: true, ...ACTIVATION };

    const response = await post(superAdmin, body);
    expect(response.status).toBe(200);
    const result = await readJson<AiScopeFlagChangeResult>(response);
    expect(result).toMatchObject({ scopeType: "country", scopeId: seed.country.id, key: "country_ai_enabled", previousValue: false, value: true });

    // The source read by the public journey is updated, and the overview reflects it.
    expect((await harness.runtime.countries.service.require(seed.country.id)).flags.country_ai_enabled).toBe(true);
    const overview = await readJson<AiScopeFlagsOverview>(await harness.request("/admin/ai/scope-flags", { headers: actorHeaders(aiAdmin) }));
    expect(overview.countries[0]?.flags.country_ai_enabled).toBe(true);
    expect(overview.history[0]).toMatchObject({ key: "country_ai_enabled", scopeType: "country", scopeId: seed.country.id, value: true });

    const audit = harness.runtime.audit.writer.search({ action: "feature_flag.policy_applied" });
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.at(-1)).toMatchObject({ result: "success" });
    const serialized = JSON.stringify(audit.at(-1));
    expect(serialized).toContain("country_ai_enabled");
    expect(serialized).not.toMatch(/token|password|authorization|secret/i);

    // Applying the same value again is a no-op that reports the unchanged state.
    const again = await readJson<AiScopeFlagChangeResult>(await post(superAdmin, body));
    expect(again).toMatchObject({ previousValue: true, value: true });

    // The generic flag route refuses the scoped row created above.
    const row = (await harness.runtime.featureFlags.service.list()).find((flag) => flag.key === "country_ai_enabled" && flag.scopeId === seed.country.id);
    expect(row).toBeDefined();
    const patch = await harness.request(`/admin/feature-flags/${row?.id}`, { method: "PATCH", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ value: false, reason: "Tentative via la route generique" }) });
    expect(patch.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "feature_flag.update_refused" }).at(-1)?.reason).toBe("scoped_flag_catalog_only");

    // The catalogue toggles refuse the AI scope keys by design.
    const catalog = await harness.request(`/admin/countries/${seed.country.id}/flags`, { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ key: "country_ai_enabled", value: false, reason: "Tentative via le catalogue" }) });
    expect(catalog.status).toBe(403);
    const catalogProduct = await harness.request(`/admin/products/${seed.product.id}/flags`, { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ key: "product_ai_scoring_enabled", value: true, reason: "Tentative via le catalogue" }) });
    expect(catalogProduct.status).toBe(403);
    expect((await harness.runtime.countries.service.require(seed.country.id)).flags.country_ai_enabled).toBe(true);
  });

  it("refuses activation without the right role, reference or on a highly sensitive product, but allows a rapid disable", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const country = { scopeType: "country", scopeId: seed.country.id, key: "country_ai_enabled" };

    const byAiAdmin = await post(aiAdmin, { ...country, value: true, ...ACTIVATION });
    expect(byAiAdmin.status).toBe(403);

    const noReference = await post(superAdmin, { ...country, value: true, reason: "Activation sans reference de politique" });
    expect(noReference.status).toBe(403);
    expect((await readJson<{ message: string }>(noReference)).message).toContain("policy reference");
    expect(harness.runtime.audit.writer.search({ action: "feature_flag.change_refused" }).some((entry) => entry.reason === "POLICY_REFERENCE_REQUIRED")).toBe(true);

    const sensitive = await harness.runtime.products.service.create({ key: "health", name: "Sante", sensitivity: "highly_sensitive" } as never, seed.admin);
    const refusedSensitive = await post(superAdmin, { scopeType: "product", scopeId: sensitive.id, key: "product_ai_scoring_enabled", value: true, ...ACTIVATION });
    expect(refusedSensitive.status).toBe(422);
    expect(harness.runtime.audit.writer.search({ action: "feature_flag.change_refused" }).some((entry) => entry.reason === "SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION")).toBe(true);

    expect((await post(superAdmin, { ...country, value: true, ...ACTIVATION })).status).toBe(200);
    const disabled = await post(aiAdmin, { ...country, value: false, reason: "Desactivation rapide par la supervision IA" });
    expect(disabled.status).toBe(200);
    expect(await readJson<AiScopeFlagChangeResult>(disabled)).toMatchObject({ previousValue: true, value: false });
    expect((await harness.runtime.countries.service.require(seed.country.id)).flags.country_ai_enabled).toBe(false);
  });

  it("rejects a key outside the scope type and an unknown scope", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const wrongKey = await post(superAdmin, { scopeType: "country", scopeId: seed.country.id, key: "product_ai_scoring_enabled", value: true, ...ACTIVATION });
    const unknownKey = await post(superAdmin, { scopeType: "country", scopeId: seed.country.id, key: "country_public_enabled", value: true, ...ACTIVATION });
    const unknownScope = await post(superAdmin, { scopeType: "country", scopeId: "00000000-0000-4000-8000-0000000000aa", key: "country_ai_enabled", value: false, reason: "Pays inconnu pour le test" });
    // Statuses are asserted as observed (see the report for the error filter mapping).
    // The controller validates the body (parseHttpInput): schema failures give 400.
    expect(wrongKey.status).toBe(400);
    expect(unknownKey.status).toBe(400);
    expect(unknownScope.status).toBe(404);
    expect((await readJson<AiScopeFlagsOverview>(await harness.request("/admin/ai/scope-flags", { headers: actorHeaders(superAdmin) }))).countries[0]?.flags.country_ai_enabled).toBe(false);
  });
});
