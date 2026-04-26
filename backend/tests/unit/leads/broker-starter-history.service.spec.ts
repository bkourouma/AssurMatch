import { describe, expect, it } from "vitest";
import { BrokerStarterHistoryService } from "../../../src/modules/leads/broker-starter-history.service";

describe("BrokerStarterHistoryService", () => {
  it("keeps immutable minimal history for a lead", () => {
    const history = new BrokerStarterHistoryService();

    history.append({ leadAssignmentId: "lead-a", partnerTenantId: "broker-a", eventType: "viewed", nextStatus: "seen" });
    history.append({ leadAssignmentId: "lead-a", partnerTenantId: "broker-a", eventType: "disputed", reason: "wrong_scope", nextStatus: "disputed" });

    expect(history.forLead("lead-a").map((event) => event.eventType)).toEqual(["viewed", "disputed"]);
    expect(history.forTenant("broker-a")).toHaveLength(2);
  });
});
