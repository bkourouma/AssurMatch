import { describe, expect, it } from "vitest";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import { MemoryLeadAssignmentsRepository } from "../../../src/modules/leads/lead-assignments.repository";

describe("lead assignment memory repository", () => {
  it("stores assignments, status changes and Starter history by tenant", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const repository = new MemoryLeadAssignmentsRepository();
    const assignment: LeadAssignmentRecord = {
      id: "lead-1",
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-a",
      status: "assigned",
      assignedAt: now,
      assignmentReason: "eligible_broker",
      publicReference: "QR-2026-0001",
      countryCode: "CI",
      productKey: "auto",
      createdAt: now,
      updatedAt: now
    };

    await repository.create(assignment);
    await repository.updateStatus(assignment.id, "accepted", { acceptedAt: now, updatedAt: now });
    await repository.appendHistory({
      id: "history-1",
      leadAssignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      eventType: "accepted",
      nextStatus: "accepted",
      occurredAt: now.toISOString()
    });

    expect(await repository.activeCountForPartner("partner-a")).toBe(1);
    expect((await repository.require(assignment.id)).status).toBe("accepted");
    expect(await repository.historyForTenant("partner-a")).toHaveLength(1);
  });
});
