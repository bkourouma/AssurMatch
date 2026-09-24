import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("sensitive feature flags compliance policy path", () => {
  it("refuses regular mutations and policy applications without a reference, records the reference otherwise", async () => {
    const audit = new AuditLogWriter();
    const service = new FeatureFlagsService(audit);
    const input = { key: "ai_recommendation_enabled", scopeType: "global" as const, value: true, reason: "pilot" };

    await expect(service.setFlag(input, superAdminActor)).rejects.toThrow(/explicit compliance policy approval/);
    await expect(service.applyCompliancePolicy(input, superAdminActor, { reference: " ", approvedBy: "compliance" })).rejects.toThrow(/explicit compliance policy approval/);
    expect(service.isEnabled("ai_recommendation_enabled")).toBe(false);

    const flag = await service.applyCompliancePolicy(input, superAdminActor, { reference: "COMP-AI-2026-001", approvedBy: "compliance-officer" });
    expect(flag.value).toBe(true);
    expect(service.isEnabled("ai_recommendation_enabled")).toBe(true);
    const applied = audit.search({ action: "feature_flag.policy_applied" });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.context).toMatchObject({ key: "ai_recommendation_enabled", nextValue: true, policyReference: "COMP-AI-2026-001", policyApprovedBy: "compliance-officer" });
    expect(audit.search({ action: "feature_flag.change_refused" })).toHaveLength(1);
  });
});
