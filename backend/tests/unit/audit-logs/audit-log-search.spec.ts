import { describe, expect, it } from "vitest";
import { MemoryAuditLogRepository, PrismaAuditLogRepository } from "../../../src/modules/audit-logs/audit-log-repository";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import type { AuditEntry } from "../../../src/modules/common/types";
import { csvCell } from "../../../src/modules/admin-operations/admin-audit-logs-console.service";

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: crypto.randomUUID(),
    action: "quote_request.created",
    targetType: "QuoteRequest",
    targetId: "q-1",
    scope: {},
    result: "success",
    context: {},
    occurredAt: new Date("2026-10-01T10:00:00.000Z"),
    retentionUntil: new Date("2036-10-01T10:00:00.000Z"),
    ...overrides
  };
}

describe("spec 056 audit-log search", () => {
  it("filters the memory store by actor, action prefix, target, result and period, newest first", async () => {
    const repository = new MemoryAuditLogRepository();
    repository.persist(entry({ actorId: "a1", occurredAt: new Date("2026-09-30T10:00:00.000Z") }));
    repository.persist(entry({ actorId: "a1", action: "quote_request.refused", result: "refused" }));
    repository.persist(entry({ actorId: "a2", action: "contact_message.received", targetType: "ContactMessage" }));

    expect((await repository.search({ action: "quote_request" }, { skip: 0, take: 10 })).total).toBe(2);
    expect((await repository.search({ actorId: "a2" }, { skip: 0, take: 10 })).items[0]?.action).toBe("contact_message.received");
    expect((await repository.search({ result: "refused" }, { skip: 0, take: 10 })).total).toBe(1);
    expect((await repository.search({ from: new Date("2026-10-01T00:00:00.000Z") }, { skip: 0, take: 10 })).total).toBe(2);
    const page = await repository.search({}, { skip: 1, take: 1 });
    expect(page).toMatchObject({ total: 3 });
    expect(page.items).toHaveLength(1);
  });

  it("builds an indexed Prisma query with a prefix action match and a bounded page", async () => {
    const calls: Array<{ kind: string; input: unknown }> = [];
    const prisma = {
      requireRuntimeClient: () => ({
        auditLog: {
          findMany: async (input: unknown) => {
            calls.push({ kind: "findMany", input });
            return [{ id: "x", actorId: null, action: "audit_log.exported", targetType: "AuditLog", targetId: "export", scope: null, result: "success", reason: null, context: { rowCount: 1 }, correlationId: null, occurredAt: new Date(), retentionUntil: new Date() }];
          },
          count: async (input: unknown) => {
            calls.push({ kind: "count", input });
            return 7;
          }
        }
      })
    } as unknown as PrismaService;
    const result = await new PrismaAuditLogRepository(prisma).search(
      { action: "audit_log", result: "success", from: new Date("2026-10-01T00:00:00.000Z") },
      { skip: 50, take: 25 }
    );
    expect(result.total).toBe(7);
    expect(result.items[0]).toMatchObject({ action: "audit_log.exported", scope: {}, context: { rowCount: 1 } });
    expect(result.items[0]).not.toHaveProperty("actorId");
    expect(calls[0]?.input).toMatchObject({
      where: { action: { startsWith: "audit_log" }, result: "success", occurredAt: { gte: new Date("2026-10-01T00:00:00.000Z") } },
      skip: 50,
      take: 25
    });
    expect(calls[1]?.input).toMatchObject({ where: { action: { startsWith: "audit_log" } } });
  });

  it("quotes CSV cells and neutralises formula injection", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "quoted", value')).toBe('"a ""quoted"", value"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});
