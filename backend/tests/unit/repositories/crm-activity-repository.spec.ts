import { describe, expect, it } from "vitest";
import { MemoryCrmActivityRepository } from "../../../src/modules/leads/crm-activity.repository";

describe("CRM activity memory repository", () => {
  it("stores CRM pipeline history and activity records by lead", async () => {
    const repository = new MemoryCrmActivityRepository();
    const occurredAt = "2026-01-01T00:00:00.000Z";

    await repository.appendPipelineHistory({
      id: "crm-history-1",
      leadAssignmentId: "lead-1",
      partnerTenantId: "partner-a",
      eventType: "status_changed",
      nextStatus: "qualifie",
      occurredAt
    });
    await repository.addNote({ id: "note-1", leadAssignmentId: "lead-1", body: "Client a rappeler", createdAt: occurredAt });
    await repository.addTask({ id: "task-1", leadAssignmentId: "lead-1", title: "Rappel", dueAt: "2026-01-02T00:00:00.000Z", createdAt: occurredAt });

    expect(await repository.pipelineHistoryForLead("lead-1")).toHaveLength(1);
    expect((await repository.notesForLead("lead-1"))[0]?.body).toBe("Client a rappeler");
    expect((await repository.tasksForLead("lead-1"))[0]?.title).toBe("Rappel");
  });
});
