import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { FeatureFlagCacheService } from "../../../src/modules/feature-flags/feature-flag-cache.service";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
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
});
