import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import { FeatureFlagCacheService } from "../../../src/modules/feature-flags/feature-flag-cache.service";
import { MemoryFeatureFlagRepository } from "../../../src/modules/feature-flags/feature-flag-repository";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { RapidDisableService } from "../../../src/modules/feature-flags/rapid-disable.service";
import { featureFlagMutationRefusedAction } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";
import { actorHeaders, createRuntimeHttpHarness } from "../runtime-http-test-utils";
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

  it("refuses admin HTTP updates that try to activate protected flags", async () => {
    const harness = await createRuntimeHttpHarness();
    const admin: ActorContext = { actorId: "feature-flag-admin", roles: ["super_admin"], mfaVerified: true, correlationId: "feature-flag-denial" };
    try {
      const disable = new RapidDisableService(harness.runtime.featureFlags.service);
      const protectedFlag = await disable.disable("global", undefined, "payments_enabled", "seed protected disabled flag", admin);

      const response = await harness.request(`/admin/feature-flags/${protectedFlag.id}`, {
        method: "PATCH",
        headers: { ...actorHeaders(admin), "content-type": "application/json" },
        body: JSON.stringify({ value: true, reason: "attempt protected activation" })
      });

      expect(response.status).toBe(403);
      expect(harness.runtime.featureFlags.service.list().find((flag) => flag.id === protectedFlag.id)?.value).toBe(false);
      expect(harness.runtime.audit.writer.search({ action: featureFlagMutationRefusedAction, result: "refused" })).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });
});
