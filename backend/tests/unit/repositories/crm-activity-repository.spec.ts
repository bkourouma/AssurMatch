import { describe, expect, it } from "vitest";
import { MemoryCrmActivityRepository } from "../../../src/modules/leads/crm-activity.repository";

describe("CRM activity memory repository", () => {
  it("stores CRM pipeline history and activity records by lead", () => {
    const repository = new MemoryCrmActivityRepository();
    const occurredAt = "2026-01-01T00:00:00.000Z";

    repository.appendPipelineHistory({
      id: "crm-history-1",
      leadAssignmentId: "lead-1",
      partnerTenantId: "partner-a",
      eventType: "status_changed",
      nextStatus: "qualifie",
      occurredAt
    });
    repository.addNote({ id: "note-1", leadAssignmentId: "lead-1", body: "Client a rappeler", createdAt: occurredAt });
    repository.addTask({ id: "task-1", leadAssignmentId: "lead-1", title: "Rappel", dueAt: "2026-01-02T00:00:00.000Z", createdAt: occurredAt });

    expect(repository.pipelineHistoryForLead("lead-1")).toHaveLength(1);
    expect(repository.notesForLead("lead-1")[0]?.body).toBe("Client a rappeler");
    expect(repository.tasksForLead("lead-1")[0]?.title).toBe("Rappel");
  });
});
