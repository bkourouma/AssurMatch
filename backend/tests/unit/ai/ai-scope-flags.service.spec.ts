import { describe, expect, it } from "vitest";
import { aiScopeFlagChangeSchema } from "../../../../packages/shared/contracts/ai-scope-flags.contracts";
import { AiScopeFlagPolicyService } from "../../../src/modules/ai/ai-scope-flags.service";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { CatalogActivationGuard } from "../../../src/modules/catalog/catalog-activation-guard";
import { CatalogFlagService } from "../../../src/modules/catalog/catalog-flag.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { ProductsService } from "../../../src/modules/products/products.module";

const superAdmin: ActorContext = { actorId: "11111111-1111-4111-8111-111111111111", roles: ["super_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "22222222-2222-4222-8222-222222222222", roles: ["compliance_admin"], mfaVerified: true };
const aiAdmin: ActorContext = { actorId: "33333333-3333-4333-8333-333333333333", roles: ["ai_admin"], mfaVerified: true };
const policy = { reference: "COMP-2026-014", approvedBy: "Responsable conformite" };

async function build() {
  const audit = new AuditLogWriter();
  const countries = new CountriesService(audit);
  const products = new ProductsService(audit);
  const featureFlags = new FeatureFlagsService(audit);
  let changes = 0;
  const service = new AiScopeFlagPolicyService({ audit, countries, products, featureFlags, onChanged: () => { changes += 1; } });
  const country = await countries.create({ isoCode: "SN", name: "Senegal", currency: "XOF", languages: ["fr"], timezone: "Africa/Dakar", regulatoryFamily: "cima" }, superAdmin);
  const product = await products.create({ key: "auto", name: "Auto" }, superAdmin);
  const sensitive = await products.create({ key: "sante", name: "Sante", sensitivity: "highly_sensitive" }, superAdmin);
  return { audit, countries, products, featureFlags, service, country, product, sensitive, changes: () => changes };
}

const countryChange = (scopeId: string, value: boolean, extra: Record<string, unknown> = {}) =>
  ({ scopeType: "country" as const, scopeId, key: "country_ai_enabled" as const, value, reason: "decision conformite", ...extra });

describe("AiScopeFlagPolicyService (lot 7)", () => {
  it("activates a country flag for super_admin with reference, and the public journey source reads it", async () => {
    const { service, country, countries, audit, featureFlags, changes } = await build();
    const result = await service.apply(superAdmin, countryChange(country.id, true, policy));
    expect(result).toMatchObject({ scopeType: "country", key: "country_ai_enabled", previousValue: false, value: true });
    expect((await countries.require(country.id)).flags.country_ai_enabled).toBe(true);
    expect(featureFlags.isEnabled("country_ai_enabled", "country", country.id)).toBe(true);
    const entry = audit.all().find((candidate) => candidate.action === "feature_flag.policy_applied");
    expect(entry?.context).toMatchObject({ key: "country_ai_enabled", policyReference: policy.reference });
    expect(changes()).toBe(1);
  });

  it("refuses without MFA, audits, and leaks nothing", async () => {
    const { service, country, audit, countries } = await build();
    await expect(service.apply({ ...superAdmin, mfaVerified: false }, countryChange(country.id, true, policy))).rejects.toMatchObject({ status: 403 });
    expect((await countries.require(country.id)).flags.country_ai_enabled).toBe(false);
    const refusal = audit.all().find((entry) => entry.action === "feature_flag.change_refused");
    expect(refusal).toMatchObject({ result: "refused", reason: "MFA_REQUIRED", context: { key: "country_ai_enabled", requestedValue: true, scopeType: "country" } });
    expect(JSON.stringify(refusal)).not.toContain(policy.reference);
  });

  it("refuses activation by ai_admin but lets ai_admin disable with a reason only", async () => {
    const { service, country, countries } = await build();
    await expect(service.apply(aiAdmin, countryChange(country.id, true, policy))).rejects.toMatchObject({ status: 403 });
    await service.apply(compliance, countryChange(country.id, true, policy));
    const off = await service.apply(aiAdmin, countryChange(country.id, false));
    expect(off).toMatchObject({ previousValue: true, value: false });
    expect((await countries.require(country.id)).flags.country_ai_enabled).toBe(false);
  });

  it("refuses an activation without reference or approver", async () => {
    const { service, country, audit } = await build();
    await expect(service.apply(superAdmin, countryChange(country.id, true))).rejects.toMatchObject({ status: 403, response: { code: "POLICY_REFERENCE_REQUIRED" } });
    await expect(service.apply(superAdmin, countryChange(country.id, true, { reference: policy.reference }))).rejects.toMatchObject({ status: 403 });
    expect(audit.all().filter((entry) => entry.reason === "POLICY_REFERENCE_REQUIRED")).toHaveLength(2);
  });

  it("refuses AI activation on a highly sensitive product with a 422", async () => {
    const { service, sensitive, product, products } = await build();
    await expect(service.apply(superAdmin, { scopeType: "product", scopeId: sensitive.id, key: "product_ai_scoring_enabled", value: true, reason: "decision conformite", ...policy }))
      .rejects.toMatchObject({ status: 422, response: { code: "SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION" } });
    await service.apply(superAdmin, { scopeType: "product", scopeId: product.id, key: "product_ai_form_assistant_enabled", value: true, reason: "decision conformite", ...policy });
    expect((await products.require(product.id)).flags.product_ai_form_assistant_enabled).toBe(true);
  });

  it("refuses a scoped actor on a product and outside its country scope", async () => {
    const { service, product, country } = await build();
    const scoped: ActorContext = { ...compliance, countryScopes: ["99999999-9999-4999-8999-999999999999"], productScopes: [product.id] };
    await expect(service.apply(scoped, { scopeType: "product", scopeId: product.id, key: "product_ai_scoring_enabled", value: true, reason: "decision conformite", ...policy })).rejects.toMatchObject({ status: 403 });
    const scopedAdmin: ActorContext = { ...aiAdmin, countryScopes: ["99999999-9999-4999-8999-999999999999"] };
    await expect(service.apply(scopedAdmin, countryChange(country.id, false))).rejects.toMatchObject({ status: 403 });
  });

  it("is a no-op when the value is unchanged (no write, no success audit)", async () => {
    const { service, country, audit, changes } = await build();
    const result = await service.apply(superAdmin, countryChange(country.id, false));
    expect(result).toMatchObject({ previousValue: false, value: false });
    expect(audit.all().filter((entry) => entry.action === "feature_flag.policy_applied")).toHaveLength(0);
    expect(changes()).toBe(0);
  });

  it("rejects a key that does not belong to the scope type", () => {
    const base = { scopeId: "44444444-4444-4444-8444-444444444444", value: true, reason: "decision conformite" };
    expect(aiScopeFlagChangeSchema.safeParse({ ...base, scopeType: "product", key: "country_ai_enabled" }).success).toBe(false);
    expect(aiScopeFlagChangeSchema.safeParse({ ...base, scopeType: "country", key: "product_ai_scoring_enabled" }).success).toBe(false);
  });

  it("answers not found for an unknown country", async () => {
    const { service } = await build();
    await expect(service.apply(superAdmin, countryChange("55555555-5555-4555-8555-555555555555", true, policy))).rejects.toThrow(/not found/);
  });

  it("overview lists flags and history, gated by MFA and role", async () => {
    const { service, country } = await build();
    await service.apply(superAdmin, countryChange(country.id, true, policy));
    const overview = await service.overview(aiAdmin);
    expect(overview.countries.find((entry) => entry.id === country.id)?.flags.country_ai_enabled).toBe(true);
    expect(overview.globalFlags.map((flag) => flag.key)).toContain("ai_summary_enabled");
    expect(overview.history[0]).toMatchObject({ key: "country_ai_enabled", scopeType: "country", scopeId: country.id, value: true });
    await expect(service.overview({ ...aiAdmin, mfaVerified: false })).rejects.toMatchObject({ status: 403 });
    await expect(service.overview({ roles: ["support_admin"], mfaVerified: true })).rejects.toMatchObject({ status: 403 });
  });

  it("non-regression: the generic flag path and the catalogue toggles still refuse these keys", async () => {
    const { country, featureFlags, countries, products, audit } = await build();
    await expect(featureFlags.setFlag({ key: "country_ai_enabled", scopeType: "country", scopeId: country.id, value: true, reason: "tentative directe" }, superAdmin)).rejects.toThrow();
    await expect(featureFlags.setFlag({ key: "product_ai_scoring_enabled", scopeType: "product", scopeId: country.id, value: true, reason: "tentative directe" }, superAdmin)).rejects.toThrow();
    const guard = new CatalogActivationGuard({ checklist: { countryActivationBlockers: async () => [], productActivationBlockers: async () => [] }, quoteForms: { list: async () => [] }, consentTexts: { listTexts: async () => [] } });
    const catalog = new CatalogFlagService({ audit, countries, products, featureFlags, guard });
    await expect(catalog.toggleCountryFlag(superAdmin, country.id, { key: "country_ai_enabled", value: true, reason: "tentative catalogue" })).rejects.toMatchObject({ status: 403 });
  });
});
