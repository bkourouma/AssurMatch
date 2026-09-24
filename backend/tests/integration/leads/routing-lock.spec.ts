import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { QuoteRedisKeys } from "../../../src/modules/common/redis/quote-redis-keys";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("lead assignment lock", () => {
  /**
   * Spec 042 changed this invariant: a request may now reach several partners (multi-send), but a
   * given partner must still never receive the same request twice.
   */
  it("prevents assigning the same quote request to the same partner twice", async () => {
    const service = new LeadAssignmentService(new AuditLogWriter());
    const quoteRequestId = crypto.randomUUID();
    const partnerTenantId = crypto.randomUUID();
    await service.create({ quoteRequestId, partnerTenantId, assignmentReason: "first" }, superAdminActor);

    await expect(service.create({ quoteRequestId, partnerTenantId, assignmentReason: "duplicate" }, superAdminActor))
      .rejects.toThrow("already has an active lead assignment for this partner");
  });

  it("allows one quote request to reach several distinct partners", async () => {
    const service = new LeadAssignmentService(new AuditLogWriter());
    const quoteRequestId = crypto.randomUUID();
    await service.create({ quoteRequestId, partnerTenantId: crypto.randomUUID(), assignmentReason: "first", recipientCount: 2 }, superAdminActor);
    const second = await service.create({ quoteRequestId, partnerTenantId: crypto.randomUUID(), assignmentReason: "second", recipientCount: 2 }, superAdminActor);

    expect(second.recipientCount).toBe(2);
    expect((await service.list()).filter((assignment) => assignment.quoteRequestId === quoteRequestId)).toHaveLength(2);
  });

  it("uses a routing lock key scoped by quote request id", async () => {
    const quoteRequestId = crypto.randomUUID();
    expect(QuoteRedisKeys.routingLock(quoteRequestId)).toBe(`lock:routing:quote:${quoteRequestId}`);
  });

  it("supports atomic routing lock acquisition through Redis port", async () => {
    const redis = new InMemoryRedisClient();
    const key = QuoteRedisKeys.routingLock("quote-1");

    await expect(redis.setNx(key, "owner-a", 30)).resolves.toBe(true);
    await expect(redis.setNx(key, "owner-b", 30)).resolves.toBe(false);
  });
});
