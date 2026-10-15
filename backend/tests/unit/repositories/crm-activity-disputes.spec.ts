import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { MemoryCrmActivityRepository, PrismaCrmActivityRepository, type LeadDisputeRecord } from "../../../src/modules/leads/crm-activity.repository";

const base: LeadDisputeRecord = {
  id: "d-1",
  leadAssignmentId: "lead-1",
  partnerTenantId: "tenant-a",
  reason: "wrong_scope",
  status: "opened",
  createdAt: "2026-10-01T00:00:00.000Z",
  source: "starter",
  countryCode: "CI"
};

describe("CRM activity repository: lead disputes (spec 063)", () => {
  it("memory: finds, updates and lists disputes newest first with filters", async () => {
    const repository = new MemoryCrmActivityRepository();
    await repository.addDispute(base);
    await repository.addDispute({ ...base, id: "d-2", leadAssignmentId: "lead-2", partnerTenantId: "tenant-b", createdAt: "2026-10-05T00:00:00.000Z" });
    expect((await repository.findDispute("d-1"))?.status).toBe("opened");
    expect(await repository.findDispute("missing")).toBeUndefined();

    const updated = await repository.updateDispute({ ...(await repository.findDispute("d-1") as LeadDisputeRecord), status: "accepted", decisionReason: "Motif de décision", creditMode: "none" });
    expect(updated).toMatchObject({ status: "accepted", creditMode: "none" });
    await expect(repository.updateDispute({ ...base, id: "unknown" })).rejects.toThrow("Dispute not found");

    expect((await repository.listDisputes()).map((item) => item.id)).toEqual(["d-2", "d-1"]);
    expect((await repository.listDisputes({ status: "accepted" })).map((item) => item.id)).toEqual(["d-1"]);
    expect((await repository.listDisputes({ partnerTenantId: "tenant-b" })).map((item) => item.id)).toEqual(["d-2"]);
    expect((await repository.listDisputes({ from: new Date("2026-10-03T00:00:00.000Z") })).map((item) => item.id)).toEqual(["d-2"]);
    expect((await repository.listDisputes({ to: new Date("2026-10-03T00:00:00.000Z") })).map((item) => item.id)).toEqual(["d-1"]);
    // A caller mutating a returned copy never alters the stored dispute.
    const copy = await repository.findDispute("d-2");
    if (copy) copy.status = "rejected";
    expect((await repository.findDispute("d-2"))?.status).toBe("opened");
  });

  it("prisma: maps the decision columns both ways and leaves null columns out of the DTO", async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const row = { id: "d-1", leadAssignmentId: "lead-1", partnerTenantId: "tenant-a", reason: "wrong_scope", comment: null, status: "accepted", createdById: "x", createdAt: new Date("2026-10-01T00:00:00.000Z"), updatedAt: new Date(), source: "starter", countryCode: "CI", decidedAt: new Date("2026-10-02T00:00:00.000Z"), decidedById: "finance", decisionReason: "Motif", creditMode: "credit_note", creditNoteId: "n-1", creditAmount: 2360 };
    const delegate = {
      create: async (input: Record<string, unknown>) => { calls.push({ op: "create", input }); return row; },
      findMany: async (input: Record<string, unknown>) => { calls.push({ op: "findMany", input }); return [row]; },
      findUnique: async (input: Record<string, unknown>) => { calls.push({ op: "findUnique", input }); return input.where && (input.where as { id: string }).id === "d-1" ? row : null; },
      update: async (input: Record<string, unknown>) => { calls.push({ op: "update", input }); return row; }
    };
    const repository = new PrismaCrmActivityRepository({ requireRuntimeClient: () => ({ brokerCrmDispute: delegate }) } as unknown as PrismaService);

    const found = await repository.findDispute("d-1");
    expect(found).toEqual({ id: "d-1", leadAssignmentId: "lead-1", partnerTenantId: "tenant-a", reason: "wrong_scope", status: "accepted", createdAt: "2026-10-01T00:00:00.000Z", source: "starter", countryCode: "CI", decidedAt: "2026-10-02T00:00:00.000Z", decidedById: "finance", decisionReason: "Motif", creditMode: "credit_note", creditNoteId: "n-1", creditAmount: 2360 });
    expect(found).not.toHaveProperty("comment");
    expect(found).not.toHaveProperty("createdById");
    expect(await repository.findDispute("missing")).toBeUndefined();

    await repository.updateDispute({ ...(found as LeadDisputeRecord), creditMode: "none" });
    const update = calls.find((call) => call.op === "update");
    expect(update?.input.where).toEqual({ id: "d-1" });
    expect(update?.input.data).not.toHaveProperty("id");
    expect(update?.input.data).toMatchObject({ status: "accepted", decidedById: "finance", creditMode: "none", decidedAt: new Date("2026-10-02T00:00:00.000Z"), comment: null });

    await repository.listDisputes({ status: "opened", partnerTenantId: "tenant-a", from: new Date("2026-10-01T00:00:00.000Z") });
    expect(calls.find((call) => call.op === "findMany")?.input).toMatchObject({ where: { status: "opened", partnerTenantId: "tenant-a", createdAt: { gte: new Date("2026-10-01T00:00:00.000Z") } }, orderBy: { createdAt: "desc" } });
  });
});
