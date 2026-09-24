import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { FeatureFlagCacheService } from "../../../src/modules/feature-flags/feature-flag-cache.service";
import { MemoryFeatureFlagRepository } from "../../../src/modules/feature-flags/feature-flag-repository";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { RapidDisableService } from "../../../src/modules/feature-flags/rapid-disable.service";
import { featureFlagMutationRefusedAction, sensitiveFeatureFlagRefusalReason } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("feature flag audit and cache", () => {
  it("audits flag changes and writes cache", async () => {
    const audit = new AuditLogWriter();
    const cache = new FeatureFlagCacheService(new InMemoryRedisClient());
    const service = new FeatureFlagsService(audit, cache);
    const flag = await service.setFlag({ key: "country_public_enabled", scopeType: "country", scopeId: "ci", value: true, reason: "pilot public launch" }, superAdminActor);

    expect(audit.all()[0]?.action).toBe("feature_flag.changed");
    await expect(cache.get(flag.key, flag.scopeType, flag.scopeId)).resolves.toMatchObject({ value: true });
  });

  it("refuses sensitive flag mutations before persistence or cache writes", async () => {
    const audit = new AuditLogWriter();
    const cache = new FeatureFlagCacheService(new InMemoryRedisClient());
    const repository = new MemoryFeatureFlagRepository();
    const service = new FeatureFlagsService(audit, cache, repository);

    await expect(service.setFlag({
      key: "payments_enabled",
      scopeType: "global",
      value: true,
      reason: "operator requested payments test"
    }, superAdminActor)).rejects.toThrow(/Forbidden feature flag mutation/);

    expect(service.list()).toHaveLength(0);
    await expect(repository.list()).resolves.toHaveLength(0);
    await expect(cache.get("payments_enabled", "global")).resolves.toBeNull();

    const refusal = audit.search({ action: featureFlagMutationRefusedAction, result: "refused" })[0];
    expect(refusal).toMatchObject({
      targetType: "FeatureFlag",
      targetId: "global:global:payments_enabled",
      reason: sensitiveFeatureFlagRefusalReason
    });
    expect(refusal?.context).toMatchObject({
      key: "payments_enabled",
      previousValue: false,
      requestedValue: true,
      policy: "sensitive_feature_flag_mutation_guard"
    });
  });

  it("keeps the explicit rapid-disable policy available for protected flags", async () => {
    const audit = new AuditLogWriter();
    const cache = new FeatureFlagCacheService(new InMemoryRedisClient());
    const service = new FeatureFlagsService(audit, cache);
    const disable = new RapidDisableService(service);

    const flag = await disable.disable("global", undefined, "payments_enabled", "emergency compliance hold", superAdminActor);

    expect(flag.value).toBe(false);
    expect(audit.search({ action: "feature_flag.changed", result: "success" })).toHaveLength(1);
    await expect(cache.get("payments_enabled", "global")).resolves.toMatchObject({ value: false });
  });
});
