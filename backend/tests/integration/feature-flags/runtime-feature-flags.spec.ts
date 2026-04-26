import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { FeatureFlagCacheService } from "../../../src/modules/feature-flags/feature-flag-cache.service";
import { MemoryFeatureFlagRepository } from "../../../src/modules/feature-flags/feature-flag-repository";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("runtime feature flags", () => {
  it("persists flag mutations through repository and caches exact decisions", async () => {
    const cache = new FeatureFlagCacheService(new InMemoryRedisClient());
    const repository = new MemoryFeatureFlagRepository();
    const service = new FeatureFlagsService(new AuditLogWriter(), cache, repository);

    const flag = await service.setFlag({
      key: "broker_crm_enabled",
      scopeType: "global",
      value: false,
      reason: "safe default"
    }, superAdminActor);

    await expect(repository.list()).resolves.toHaveLength(1);
    await expect(repository.historyFor(flag.id)).resolves.toHaveLength(1);
    await expect(cache.isFailClosed("broker_crm_enabled", "global")).resolves.toBe(false);
  });
});
