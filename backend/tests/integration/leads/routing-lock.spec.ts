import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { QuoteRedisKeys } from "../../../src/modules/common/redis/quote-redis-keys";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("lead assignment lock", () => {
  it("prevents multiple active assignments for one quote request", () => {
    const service = new LeadAssignmentService(new AuditLogWriter());
    const quoteRequestId = crypto.randomUUID();
    service.create({ quoteRequestId, partnerTenantId: crypto.randomUUID(), assignmentReason: "first" }, superAdminActor);

    expect(() => service.create({ quoteRequestId, partnerTenantId: crypto.randomUUID(), assignmentReason: "second" }, superAdminActor)).toThrow("already has an active lead assignment");
  });

  it("uses a routing lock key scoped by quote request id", () => {
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
