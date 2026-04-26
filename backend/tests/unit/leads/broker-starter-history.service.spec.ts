import { describe, expect, it } from "vitest";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";

describe("BrokerStarterHistoryService", () => {
  it("keeps immutable minimal history for a lead", async () => {
    const history = new BrokerStarterHistoryService();

    await history.append({ leadAssignmentId: "lead-a", partnerTenantId: "broker-a", eventType: "viewed", nextStatus: "seen" });
    await history.append({ leadAssignmentId: "lead-a", partnerTenantId: "broker-a", eventType: "disputed", reason: "wrong_scope", nextStatus: "disputed" });

    expect((await history.forLead("lead-a")).map((event) => event.eventType)).toEqual(["viewed", "disputed"]);
    expect(await history.forTenant("broker-a")).toHaveLength(2);
  });
});
