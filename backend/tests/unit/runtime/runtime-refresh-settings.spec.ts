import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { MemoryFeatureFlagRepository } from "../../../src/modules/feature-flags/feature-flag-repository";
import { satisfactionSurveyDelayMinutes } from "../../../src/modules/satisfaction-surveys/satisfaction-survey-trigger.service";
import { featureFlagRefreshSeconds } from "../../../src/main";

describe("spec 059 follow-up runtime settings", () => {
  it("reads the API feature-flag refresh interval (30 s by default, 0 disables)", () => {
    expect(featureFlagRefreshSeconds({})).toBe(30);
    expect(featureFlagRefreshSeconds({ ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS: "5" })).toBe(5);
    expect(featureFlagRefreshSeconds({ ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS: "0" })).toBe(0);
    expect(featureFlagRefreshSeconds({ ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS: "abc" })).toBe(30);
  });

  it("keeps the 24 h survey delay unless an acceptance stack overrides it", () => {
    expect(satisfactionSurveyDelayMinutes({})).toBe(1440);
    expect(satisfactionSurveyDelayMinutes({ ASSURMATCH_SATISFACTION_SURVEY_DELAY_MINUTES: "0" })).toBe(0);
    expect(satisfactionSurveyDelayMinutes({ ASSURMATCH_SATISFACTION_SURVEY_DELAY_MINUTES: "-5" })).toBe(1440);
  });

  it("a reload never overwrites a change this process made while the read was in flight", async () => {
    const repository = new MemoryFeatureFlagRepository();
    const flags = new FeatureFlagsService(new AuditLogWriter(), undefined, repository);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = repository.list.bind(repository);
    repository.list = async () => {
      const snapshot = await original();
      await gate;
      return snapshot;
    };
    const reload = flags.hydrateFromRepository();
    await flags.setFlag({ key: "public_comparator_enabled", scopeType: "global", value: true, reason: "ouverture pendant le rechargement" }, { roles: ["super_admin"], mfaVerified: true });
    release();
    await reload;
    expect(flags.isEnabled("public_comparator_enabled")).toBe(true);
  });
});
