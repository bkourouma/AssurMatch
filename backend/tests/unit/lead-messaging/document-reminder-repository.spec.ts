import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { MemoryLeadMessagingRepository, PrismaLeadMessagingRepository, type LeadDocumentRequestRecord } from "../../../src/modules/lead-messaging/lead-messaging.repository";

const request = (id: string, overrides: Partial<LeadDocumentRequestRecord> = {}): LeadDocumentRequestRecord => ({
  id,
  quoteRequestId: "q1",
  leadAssignmentId: "a1",
  partnerTenantId: "t1",
  label: "secret label",
  status: "open",
  fulfilledDocumentCount: 0,
  createdAt: new Date("2026-10-10T10:00:00.000Z"),
  updatedAt: new Date("2026-10-10T10:00:00.000Z"),
  ...overrides
});

describe("document request reminder queries (spec 067)", () => {
  it("memory: lists only open, unreminded, non-anonymized requests created before the cutoff, without the label", async () => {
    const repository = new MemoryLeadMessagingRepository();
    const cutoff = new Date("2026-10-10T10:00:00.000Z");
    await repository.createDocumentRequest(request("due"));
    await repository.createDocumentRequest(request("too-recent", { createdAt: new Date(cutoff.getTime() + 1) }));
    await repository.createDocumentRequest(request("fulfilled", { status: "fulfilled" }));
    await repository.createDocumentRequest(request("cancelled", { status: "cancelled" }));
    await repository.createDocumentRequest(request("anon", { anonymizedAt: new Date() }));
    await repository.createDocumentRequest(request("reminded", { reminderQueuedAt: new Date() }));
    const list = await repository.listOpenForReminder(cutoff);
    expect(list).toEqual([{ id: "due", quoteRequestId: "q1", leadAssignmentId: "a1", partnerTenantId: "t1", createdAt: cutoff }]);
  });

  it("memory: markReminderQueued sets the marker once and never moves it", async () => {
    const repository = new MemoryLeadMessagingRepository();
    await repository.createDocumentRequest(request("r1"));
    const first = new Date("2026-10-20T00:00:00.000Z");
    expect(await repository.markReminderQueued(["r1", "unknown"], first)).toBe(1);
    expect(await repository.markReminderQueued(["r1"], new Date())).toBe(0);
    expect((await repository.findDocumentRequest("r1"))?.reminderQueuedAt).toEqual(first);
    expect(await repository.listOpenForReminder(new Date("2027-01-01"))).toEqual([]);
  });

  it("prisma: filters in the query and selects no free text", async () => {
    const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
    const delegate = {
      findMany: async (input: Record<string, unknown>) => { calls.push({ method: "findMany", input }); return []; },
      updateMany: async (input: Record<string, unknown>) => { calls.push({ method: "updateMany", input }); return { count: 2 }; }
    };
    const prisma = { requireRuntimeClient: () => ({ leadDocumentRequest: delegate }) } as unknown as PrismaService;
    const repository = new PrismaLeadMessagingRepository(prisma);
    const cutoff = new Date("2026-10-17T00:00:00.000Z");
    await repository.listOpenForReminder(cutoff);
    expect(calls[0]?.input).toMatchObject({
      where: { status: "open", reminderQueuedAt: null, anonymizedAt: null, createdAt: { lte: cutoff } },
      select: { id: true, quoteRequestId: true, leadAssignmentId: true, partnerTenantId: true, createdAt: true }
    });
    expect(JSON.stringify(calls[0]?.input)).not.toContain("label");
    expect(await repository.markReminderQueued(["a", "b"], cutoff)).toBe(2);
    expect(calls[1]?.input).toEqual({ where: { id: { in: ["a", "b"] }, reminderQueuedAt: null }, data: { reminderQueuedAt: cutoff } });
    expect(await repository.markReminderQueued([], cutoff)).toBe(0);
    expect(calls).toHaveLength(2);
  });
});
