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
