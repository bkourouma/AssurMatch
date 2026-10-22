import { beforeEach, describe, expect, it } from "vitest";
import { SystemHealthService } from "../../../src/modules/admin/system-health.module";
import { auditReliability } from "../../../src/modules/observability/audit-metrics";

const ok = { health: async () => "ok" } as never;
const queue = { health: () => "ok" } as never;

describe("system health audit check (spec 075 lot 8)", () => {
  beforeEach(() => auditReliability.reset());

  it("is degraded after a recent drop, then recovers once the window has passed", async () => {
    let now = 1_000_000;
    const service = new SystemHealthService(ok, ok, queue, () => now, 60_000);
    expect((await service.check()).checks.audit).toBe("ok");
    auditReliability.recordDropped();
    expect((await service.check()).checks.audit).toBe("degraded");
    now += 59_000;
    expect((await service.check()).checks.audit).toBe("degraded");
    now += 2_000;
    const health = await service.check();
    expect(health.checks.audit).toBe("ok");
    expect(health.audit.auditDropped).toBe(1);
    auditReliability.recordDropped();
    expect((await service.check()).checks.audit).toBe("degraded");
  });

  it("ignores drops that happened before the service started", async () => {
    auditReliability.recordDropped();
    const service = new SystemHealthService(ok, ok, queue, () => 5, 60_000);
    expect((await service.check()).checks.audit).toBe("ok");
  });

  it("stays degraded while the outbox is not empty", async () => {
    const service = new SystemHealthService(ok, ok, queue);
    auditReliability.adjustOutboxDepth(2);
    expect((await service.check()).checks.audit).toBe("degraded");
  });
});
