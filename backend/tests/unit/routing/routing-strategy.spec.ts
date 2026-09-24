import { describe, expect, it } from "vitest";
import { selectRoutingCandidate, type RoutingCandidate } from "../../../src/modules/routing/routing-strategy";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-05T09:00:00.000Z");

function candidate(partnerTenantId: string, overrides: Partial<RoutingCandidate["stats"]> = {}, quotaMonthlyLeads = 0): RoutingCandidate {
  return { partnerTenantId, quotaMonthlyLeads, stats: { monthlyCount: 0, received90d: 0, accepted90d: 0, ...overrides } };
}

describe("selectRoutingCandidate", () => {
  it("keeps the legacy first-eligible order by partner id", () => {
    const selection = selectRoutingCandidate({ mode: "first_eligible", candidates: [candidate("b"), candidate("a")] });
    expect(selection.selected?.partnerTenantId).toBe("a");
    expect(selection.reason).toBe("eligible_broker_selected");
  });

  it("round-robin picks the least recently assigned partner, never-assigned first", () => {
    const candidates = [
      candidate("a", { lastAssignedAt: new Date(now.getTime() - 1 * day) }),
      candidate("b", { lastAssignedAt: new Date(now.getTime() - 3 * day) }),
      candidate("c")
    ];
    const selection = selectRoutingCandidate({ mode: "round_robin", candidates });
    expect(selection.ranking).toEqual(["c", "b", "a"]);
    expect(selection.reason).toBe("round_robin_selected");
  });

  it("priority honours the rule order and sends unlisted partners last", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const selection = selectRoutingCandidate({
      mode: "priority",
      candidates,
      priorities: [{ partnerTenantId: "c", priority: 1 }, { partnerTenantId: "b", priority: 2 }]
    });
    expect(selection.ranking).toEqual(["c", "b", "a"]);
  });

  it("capacity prefers the largest remaining monthly quota and treats quota 0 as unlimited", () => {
    const candidates = [
      candidate("a", { monthlyCount: 9 }, 10),
      candidate("b", { monthlyCount: 2 }, 10),
      candidate("c", { monthlyCount: 50 }, 0)
    ];
    const selection = selectRoutingCandidate({ mode: "capacity", candidates });
    expect(selection.ranking).toEqual(["c", "b", "a"]);
  });

  it("performance ranks by acceptance rate then first-action speed", () => {
    const candidates = [
      candidate("a", { received90d: 10, accepted90d: 5, averageFirstActionMinutes: 30 }),
      candidate("b", { received90d: 10, accepted90d: 8, averageFirstActionMinutes: 120 }),
      candidate("c", { received90d: 10, accepted90d: 8, averageFirstActionMinutes: 15 }),
      candidate("d")
    ];
    const selection = selectRoutingCandidate({ mode: "performance", candidates });
    expect(selection.ranking).toEqual(["c", "b", "a", "d"]);
  });

  it("exclusive only routes to the configured partner and fails closed otherwise", () => {
    const candidates = [candidate("a"), candidate("b")];
    expect(selectRoutingCandidate({ mode: "exclusive", candidates, exclusivePartnerTenantId: "b" }).selected?.partnerTenantId).toBe("b");
    const blocked = selectRoutingCandidate({ mode: "exclusive", candidates, exclusivePartnerTenantId: "zz" });
    expect(blocked.selected).toBeUndefined();
    expect(blocked.reason).toBe("exclusive_partner_not_eligible");
  });

  it("manual never selects and empty candidate lists report no eligible broker", () => {
    expect(selectRoutingCandidate({ mode: "manual", candidates: [candidate("a")] })).toMatchObject({ reason: "manual_assignment_required" });
    expect(selectRoutingCandidate({ mode: "round_robin", candidates: [] })).toMatchObject({ reason: "no_eligible_broker" });
  });

  it("is deterministic for identical inputs", () => {
    const build = () => [candidate("b", { lastAssignedAt: new Date(now.getTime() - 2 * day) }), candidate("a", { lastAssignedAt: new Date(now.getTime() - 2 * day) })];
    expect(selectRoutingCandidate({ mode: "round_robin", candidates: build() }).ranking).toEqual(selectRoutingCandidate({ mode: "round_robin", candidates: build() }).ranking);
    expect(selectRoutingCandidate({ mode: "round_robin", candidates: build() }).selected?.partnerTenantId).toBe("a");
  });
});
