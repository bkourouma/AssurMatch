import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { applyFlagPolicy, FlagPolicyRefusedError } from "../../../src/runtime/ops/apply-flag-policy";

const policy = { reference: "POL-2026-048", approvedBy: "DPO AssurMatch", reason: "Ouverture de l'enquete de satisfaction" };

describe("ops apply-flag-policy (spec 059 follow-up)", () => {
  it("switches a sensitive flag through the audited compliance-policy path", async () => {
    const audit = new AuditLogWriter();
    const flags = new FeatureFlagsService(audit);
    const { flag, previousValue } = await applyFlagPolicy(flags, { flag: "satisfaction_survey_enabled", value: true, ...policy });
    expect(previousValue).toBe(false);
    expect(flag.value).toBe(true);
    expect(flags.isEnabled("satisfaction_survey_enabled")).toBe(true);
    const [entry] = audit.search({ action: "feature_flag.policy_applied" });
    expect(entry?.context).toMatchObject({ policyReference: "POL-2026-048", policyApprovedBy: "DPO AssurMatch" });
  });

  it("refuses regulated modules, unknown flags, non-policy flags and an incomplete policy", async () => {
    const flags = new FeatureFlagsService(new AuditLogWriter());
    await expect(applyFlagPolicy(flags, { flag: "payments_enabled", value: true, ...policy })).rejects.toBeInstanceOf(FlagPolicyRefusedError);
    await expect(applyFlagPolicy(flags, { flag: "insurer_api_enabled", value: true, ...policy })).rejects.toMatchObject({ reason: "regulated_module_without_validated_spec" });
    await expect(applyFlagPolicy(flags, { flag: "public_comparator_enabled", value: true, ...policy })).rejects.toMatchObject({ reason: "not_a_policy_activatable_flag" });
    await expect(applyFlagPolicy(flags, { flag: "made_up_flag", value: true, ...policy })).rejects.toMatchObject({ reason: expect.stringContaining("invalid_input") });
    await expect(applyFlagPolicy(flags, { flag: "billing_enabled", value: true, ...policy, reference: " " })).rejects.toBeInstanceOf(FlagPolicyRefusedError);
    // Switching a regulated module OFF is always accepted.
    expect((await applyFlagPolicy(flags, { flag: "payments_enabled", value: false, ...policy })).flag.value).toBe(false);
  });
});

describe("ops apply-flag-policy, per-scope AI flags (spec 074)", () => {
  const scopedPolicy = { reference: "POL-2026-051", approvedBy: "DPO AssurMatch", reason: "Ouverture IA pays apres decision" };

  it("activates a country flag through the scoped path and refuses invalid or unauthorised requests", async () => {
    const { AiScopeFlagPolicyService } = await import("../../../src/modules/ai/ai-scope-flags.service");
    const { CountriesService } = await import("../../../src/modules/countries/countries.module");
    const { ProductsService } = await import("../../../src/modules/products/products.module");
    const { applyScopedFlagPolicy } = await import("../../../src/runtime/ops/apply-flag-policy");
    const audit = new AuditLogWriter();
    const countries = new CountriesService(audit);
    const products = new ProductsService(audit);
    const featureFlags = new FeatureFlagsService(audit);
    const service = new AiScopeFlagPolicyService({ audit, countries, products, featureFlags });
    const admin = { roles: ["super_admin" as const], mfaVerified: true };
    const country = await countries.create({ isoCode: "SN", name: "Senegal", currency: "XOF", languages: ["fr"], timezone: "Africa/Dakar", regulatoryFamily: "cima" }, admin);
    const sensitive = await products.create({ key: "sante", name: "Sante", sensitivity: "highly_sensitive" }, admin);

    const result = await applyScopedFlagPolicy(service, { scopeType: "country", scopeId: country.id, flag: "country_ai_enabled", value: true, ...scopedPolicy });
    expect(result).toMatchObject({ previousValue: false, value: true });
    expect((await countries.require(country.id)).flags.country_ai_enabled).toBe(true);
    expect(audit.search({ action: "feature_flag.policy_applied" })[0]?.context).toMatchObject({ policyReference: scopedPolicy.reference });

    await expect(applyScopedFlagPolicy(service, { scopeType: "product", scopeId: sensitive.id, flag: "product_ai_scoring_enabled", value: true, ...scopedPolicy }))
      .rejects.toMatchObject({ reason: "sensitive_product_ai_requires_exception" });
    await expect(applyScopedFlagPolicy(service, { scopeType: "country", scopeId: "not-a-uuid", flag: "country_ai_enabled", value: true, ...scopedPolicy }))
      .rejects.toMatchObject({ reason: expect.stringContaining("invalid_input") });
    await expect(applyScopedFlagPolicy(service, { scopeType: "country", scopeId: country.id, flag: "product_ai_scoring_enabled", value: true, ...scopedPolicy }))
      .rejects.toBeInstanceOf(FlagPolicyRefusedError);
  });
});
