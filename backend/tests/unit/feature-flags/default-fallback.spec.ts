import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { COUNTRY_FEATURE_FLAG_DEFAULTS, GLOBAL_FEATURE_FLAG_DEFAULTS, PRODUCT_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";

const admin = { actorId: "admin", roles: ["super_admin" as const], mfaVerified: true };

describe("global feature flag defaults (spec 063, PRD section 9.1)", () => {
  it("turns the three broker back-office modules on by default and keeps every regulated module off", () => {
    const flags = new FeatureFlagsService(new AuditLogWriter());
    for (const key of ["starter_portal_enabled", "broker_crm_enabled", "broker_dashboard_enabled"]) expect(flags.isEnabled(key)).toBe(true);
    for (const key of ["billing_enabled", "payments_enabled", "e_signature_enabled", "policy_issuance_enabled", "claims_enabled", "insurer_api_enabled", "ai_summary_enabled", "multi_broker_routing_enabled", "public_comparator_enabled", "quote_request_enabled"]) {
      expect(flags.isEnabled(key)).toBe(false);
    }
    expect(flags.isEnabled("unknown_flag")).toBe(false);
  });

  it("lets a stored row win over the default, so an admin can still switch a module off", async () => {
    const flags = new FeatureFlagsService(new AuditLogWriter());
    await flags.setFlag({ key: "broker_crm_enabled", scopeType: "global", value: false, reason: "admin switches the CRM off" }, admin);
    expect(flags.isEnabled("broker_crm_enabled")).toBe(false);
    expect(flags.isEnabled("starter_portal_enabled")).toBe(true);
  });

  it("does not apply the global default to other scopes", () => {
    const flags = new FeatureFlagsService(new AuditLogWriter());
    expect(flags.isEnabled("broker_crm_enabled", "partner", "partner-1")).toBe(false);
  });

  it("keeps the reference seed defaults in step with the code defaults", () => {
    const seed = JSON.parse(readFileSync(join(process.cwd(), "scripts", "preprod", "seeds", "reference", "feature-flags.defaults.json"), "utf8")) as { global: Record<string, boolean>; country: Record<string, boolean>; product: Record<string, boolean> };
    const code = GLOBAL_FEATURE_FLAG_DEFAULTS as Record<string, boolean>;
    for (const [key, value] of Object.entries(seed.global)) expect(code[key], key).toBe(value);
    expect(seed.country).toEqual(COUNTRY_FEATURE_FLAG_DEFAULTS);
    expect(seed.product).toEqual(PRODUCT_FEATURE_FLAG_DEFAULTS);
  });
});
