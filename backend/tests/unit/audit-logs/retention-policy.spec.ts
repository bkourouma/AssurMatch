import { describe, expect, it } from "vitest";
import { RetentionPolicyService } from "../../../src/modules/audit-logs/retention-policy.service";

describe("retention policy", () => {
  it("applies 10-year default retention and accepts regime override", () => {
    const service = new RetentionPolicyService();
    expect(service.retentionUntil(new Date("2026-04-25T00:00:00Z")).getUTCFullYear()).toBe(2036);
    expect(service.retentionUntil(new Date("2026-04-25T00:00:00Z"), 12).getUTCFullYear()).toBe(2038);
  });
});
