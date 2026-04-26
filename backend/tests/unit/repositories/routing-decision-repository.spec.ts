import { describe, expect, it } from "vitest";
import { MemoryRoutingDecisionsRepository } from "../../../src/modules/leads/routing-decisions.repository";

describe("routing decision memory repository", () => {
  it("stores routing outcomes without changing routing policy", () => {
    const repository = new MemoryRoutingDecisionsRepository();
    repository.create({
      id: "routing-1",
      quoteRequestId: "quote-1",
      result: "assigned",
      selectedPartnerTenantId: "partner-a",
      candidateCount: 1,
      excludedCandidates: [],
      reasons: ["eligible_broker"],
      correlationId: "correlation-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(repository.list()).toHaveLength(1);
    expect(repository.list()[0]?.selectedPartnerTenantId).toBe("partner-a");
  });
});
