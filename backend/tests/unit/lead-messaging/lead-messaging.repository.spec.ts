import { describe, expect, it } from "vitest";
import { MemoryLeadMessagingRepository, PrismaLeadMessagingRepository } from "../../../src/modules/lead-messaging/lead-messaging.repository";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { conversationIdFor, leadState } from "../../../src/modules/lead-messaging/lead-messaging.rules";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";

const base = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  quoteRequestId: "q1",
  leadAssignmentId: "a1",
  partnerTenantId: "t1",
  senderType: "broker" as const,
  body: `corps ${id}`,
  createdAt: new Date("2026-10-15T10:00:00.000Z"),
  ...overrides
});

describe("lead messaging repository (append-only)", () => {
  it("exposes no method that rewrites or deletes a message body", () => {
    for (const repository of [MemoryLeadMessagingRepository.prototype, PrismaLeadMessagingRepository.prototype]) {
      const methods = Object.getOwnPropertyNames(repository).filter((name) => name !== "constructor");
      const forbidden = methods.filter((name) => /^(update|edit|set|patch|delete|remove|replace|upsert|save)/i.test(name) && !/Document/.test(name));
      expect(forbidden, "a message is append-only").toEqual([]);
      expect(methods).toEqual(expect.arrayContaining(["appendMessage", "markRead", "anonymizeForAssignments", "listForConversation"]));
    }
  });

  it("keeps a body unchanged by every operation but the spec 046 anonymization", async () => {
    const repository = new MemoryLeadMessagingRepository();
    await repository.appendMessage(base("m1"), []);
    await repository.markRead("a1", "t1", "visitor", new Date());
    const [read] = await repository.listForConversation("a1", "t1");
    expect(read).toMatchObject({ body: "corps m1" });
    expect(read?.readAt).toBeInstanceOf(Date);
    // Mutating a returned copy never reaches the store.
    read!.body = "modifie";
    expect((await repository.findMessage("m1"))?.body).toBe("corps m1");
    await repository.anonymizeForAssignments(["a1"], "[anonymise]", new Date());
    expect((await repository.findMessage("m1"))?.body).toBe("[anonymise]");
  });

  it("separates conversations by broker on the same assignment and orders by creation then id", async () => {
    const repository = new MemoryLeadMessagingRepository();
    await repository.appendMessage(base("b", { createdAt: new Date("2026-10-15T10:00:01.000Z") }), []);
    await repository.appendMessage(base("a", { createdAt: new Date("2026-10-15T10:00:01.000Z") }), []);
    await repository.appendMessage(base("c", { createdAt: new Date("2026-10-15T09:00:00.000Z") }), []);
    await repository.appendMessage(base("other", { partnerTenantId: "t2" }), []);
    expect((await repository.listForConversation("a1", "t1")).map((message) => message.id)).toEqual(["c", "a", "b"]);
    expect((await repository.listForConversation("a1", "t2")).map((message) => message.id)).toEqual(["other"]);
    expect(await repository.countForConversation("a1", "t1")).toBe(3);
    expect(await repository.countForConversation("a1", "t3")).toBe(0);
  });

  it("marks only the other side's unread messages and finds a retry by its client request id", async () => {
    const repository = new MemoryLeadMessagingRepository();
    await repository.appendMessage(base("broker-1", { clientRequestId: "key-aaaaaaaa" }), []);
    await repository.appendMessage(base("visitor-1", { senderType: "visitor" }), []);
    expect(await repository.markRead("a1", "t1", "broker", new Date())).toBe(1);
    expect(await repository.markRead("a1", "t1", "broker", new Date())).toBe(0);
    const messages = await repository.listForConversation("a1", "t1");
    expect(messages.find((message) => message.id === "broker-1")?.readAt).toBeUndefined();
    expect(messages.find((message) => message.id === "visitor-1")?.readAt).toBeInstanceOf(Date);
    expect((await repository.findByClientRequestId("a1", "broker", "key-aaaaaaaa"))?.id).toBe("broker-1");
    expect(await repository.findByClientRequestId("a1", "visitor", "key-aaaaaaaa")).toBeUndefined();
  });

  it("only moves a document request from open to fulfilled or cancelled", async () => {
    const repository = new MemoryLeadMessagingRepository();
    const now = new Date();
    const request = { id: "r1", quoteRequestId: "q1", leadAssignmentId: "a1", partnerTenantId: "t1", label: "Carte grise", status: "open" as const, fulfilledDocumentCount: 0, createdAt: now, updatedAt: now };
    await repository.createDocumentRequest(request);
    await repository.createDocumentRequest({ ...request, id: "r2" });
    expect(await repository.transitionDocumentRequest("r1", { status: "fulfilled", fulfilledAt: now, fulfilledDocumentCount: 2 })).toMatchObject({ status: "fulfilled", fulfilledDocumentCount: 2, label: "Carte grise" });
    await expect(repository.transitionDocumentRequest("r1", { status: "cancelled", cancelledAt: now, cancelReason: "broker" })).rejects.toThrow(/not open/);
    expect(await repository.transitionDocumentRequest("r2", { status: "cancelled", cancelledAt: now, cancelReason: "reassigned" })).toMatchObject({ status: "cancelled", cancelReason: "reassigned" });
    await expect(repository.transitionDocumentRequest("r2", { status: "fulfilled", fulfilledAt: now, fulfilledDocumentCount: 1 })).rejects.toThrow(/not open/);
  });
});

describe("lead messaging rules", () => {
  it("derives an opaque, stable conversation id from the assignment and the broker", () => {
    const id = conversationIdFor("assignment-1", "tenant-1");
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(conversationIdFor("assignment-1", "tenant-1")).toBe(id);
    expect(conversationIdFor("assignment-1", "tenant-2")).not.toBe(id);
    expect(id).not.toContain("tenant");
  });

  it("reads an assignment as closed, accepted or not accepted like the proposals do", () => {
    const assignment = (overrides: Partial<LeadAssignmentRecord>): LeadAssignmentRecord => ({ id: "a", quoteRequestId: "q", partnerTenantId: "t", status: "assigned", assignedAt: new Date(), assignmentReason: "r", createdAt: new Date(), updatedAt: new Date(), ...overrides });
    expect(leadState(assignment({}))).toBe("not_accepted");
    expect(leadState(assignment({ status: "accepted" }))).toBe("accepted");
    expect(leadState(assignment({ status: "contacted" }))).toBe("accepted");
    expect(leadState(assignment({ status: "rejected" }))).toBe("closed");
    expect(leadState(assignment({ status: "accepted", crmStatus: "perdu" }))).toBe("closed");
    expect(leadState(assignment({ crmStatus: "contacte" }))).toBe("accepted");
  });
});

describe("Prisma lead messaging repository (stubbed client)", () => {
  /** A client whose `$transaction` records begin / commit / rollback, so the unit of work can be asserted. */
  function stubbedPrisma(options: { failAttachments?: boolean; failMessage?: unknown; existing?: Record<string, unknown> } = {}) {
    const calls: string[] = [];
    const tx = {
      leadMessage: {
        create: async (input: { data: Record<string, unknown> }) => {
          calls.push("message");
          if (options.failMessage) throw options.failMessage;
          return { ...input.data };
        }
      },
      leadMessageAttachment: {
        createMany: async () => {
          calls.push("attachments");
          if (options.failAttachments) throw new Error("attachments unavailable");
          return { count: 1 };
        }
      }
    };
    const client = {
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push("begin");
        try {
          const result = await callback(tx);
          calls.push("commit");
          return result;
        } catch (error) {
          calls.push("rollback");
          throw error;
        }
      },
      leadMessage: { findFirst: async () => options.existing ?? null },
      leadMessageAttachment: { findMany: async () => [] }
    };
    return { prisma: { requireRuntimeClient: () => client } as unknown as PrismaService, calls };
  }

  const attachment = {
    id: "att-1", messageId: "m1", leadAssignmentId: "a1", quoteRequestId: "q1", fileName: "devis.pdf", mimeType: "application/pdf", sizeBytes: 10,
    checksum: "sha256:x", storageKey: "lm-1", scanStatus: "clean" as const, createdAt: new Date("2026-10-15T10:00:00.000Z")
  };

  it("writes the message and its attachments in one transaction", async () => {
    const { prisma, calls } = stubbedPrisma();
    const stored = await new PrismaLeadMessagingRepository(prisma).appendMessage(base("m1"), [attachment]);
    expect(calls).toEqual(["begin", "message", "attachments", "commit"]);
    expect(stored).toMatchObject({ id: "m1", body: "corps m1", attachments: [expect.objectContaining({ id: "att-1" })] });
  });

  it("rolls the message back when its attachments cannot be written", async () => {
    const { prisma, calls } = stubbedPrisma({ failAttachments: true });
    await expect(new PrismaLeadMessagingRepository(prisma).appendMessage(base("m1"), [attachment])).rejects.toThrow(/attachments unavailable/);
    expect(calls).toEqual(["begin", "message", "attachments", "rollback"]);
  });

  it("replays the existing message on a unique violation of (assignment, sender, clientRequestId) and rethrows any other error", async () => {
    const existing = { ...base("m0"), clientRequestId: "key-aaaaaaaa" };
    const replay = stubbedPrisma({ failMessage: { code: "P2002" }, existing });
    expect(await new PrismaLeadMessagingRepository(replay.prisma).appendMessage(base("m1", { clientRequestId: "key-aaaaaaaa" }), [])).toMatchObject({ id: "m0", attachments: [] });
    expect(replay.calls).toEqual(["begin", "message", "rollback"]);
    // A unique violation without a client key, or without a stored twin, is not a replay.
    await expect(new PrismaLeadMessagingRepository(stubbedPrisma({ failMessage: { code: "P2002" } }).prisma).appendMessage(base("m1"), [])).rejects.toMatchObject({ code: "P2002" });
    await expect(new PrismaLeadMessagingRepository(stubbedPrisma({ failMessage: { code: "P2002" } }).prisma).appendMessage(base("m1", { clientRequestId: "key-bbbbbbbb" }), [])).rejects.toMatchObject({ code: "P2002" });
    await expect(new PrismaLeadMessagingRepository(stubbedPrisma({ failMessage: new Error("connection reset"), existing }).prisma).appendMessage(base("m1", { clientRequestId: "key-aaaaaaaa" }), [])).rejects.toThrow(/connection reset/);
  });
});
