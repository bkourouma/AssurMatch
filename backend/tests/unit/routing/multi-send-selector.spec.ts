import { describe, expect, it } from "vitest";
import { EMPTY_ROUTING_STATS, selectRoutingCandidates, type RoutingCandidate } from "../../../src/modules/routing/routing-strategy";

function candidate(partnerTenantId: string, overrides: Partial<RoutingCandidate> = {}): RoutingCandidate {
  return { partnerTenantId, quotaMonthlyLeads: 0, stats: EMPTY_ROUTING_STATS, ...overrides };
}

const three = [candidate("partner-a"), candidate("partner-b"), candidate("partner-c")];

describe("selectRoutingCandidates (spec 042)", () => {
  it("fans out down the same ranking the single-send strategy would have used", () => {
    const selection = selectRoutingCandidates({ mode: "first_eligible", candidates: [...three].reverse() }, 3);
    expect(selection.selected.map((entry) => entry.partnerTenantId)).toEqual(["partner-a", "partner-b", "partner-c"]);
    expect(selection.reason).toBe("multi_send_selected_3");
  });

  it("respects the recipient cap and never exceeds the eligible pool", () => {
    expect(selectRoutingCandidates({ mode: "first_eligible", candidates: three }, 2).selected).toHaveLength(2);
    expect(selectRoutingCandidates({ mode: "first_eligible", candidates: three }, 5).selected).toHaveLength(3);
  });

  it("keeps a single recipient when max is 1, and for exclusive or manual rules", () => {
    expect(selectRoutingCandidates({ mode: "first_eligible", candidates: three }, 1).selected).toHaveLength(1);
    const exclusive = selectRoutingCandidates({ mode: "exclusive", candidates: three, exclusivePartnerTenantId: "partner-b" }, 3);
    expect(exclusive.selected.map((entry) => entry.partnerTenantId)).toEqual(["partner-b"]);
    expect(selectRoutingCandidates({ mode: "manual", candidates: three }, 3).selected).toEqual([]);
  });

  it("skips a ranked partner whose monthly quota is exhausted", () => {
    const full = candidate("partner-a", { quotaMonthlyLeads: 2, stats: { ...EMPTY_ROUTING_STATS, monthlyCount: 2 } });
    const selection = selectRoutingCandidates({ mode: "first_eligible", candidates: [full, candidate("partner-b"), candidate("partner-c")] }, 2);
    expect(selection.selected.map((entry) => entry.partnerTenantId)).toEqual(["partner-b", "partner-c"]);
  });

  it("returns nothing selectable when there is no eligible candidate at all", () => {
    const selection = selectRoutingCandidates({ mode: "first_eligible", candidates: [] }, 3);
    expect(selection.selected).toEqual([]);
    expect(selection.reason).toBe("no_eligible_broker");
  });
});
