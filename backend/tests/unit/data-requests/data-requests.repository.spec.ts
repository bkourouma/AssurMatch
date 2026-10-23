import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import {
  DuplicateDataRequestReferenceError,
  MemoryDataRequestsRepository,
  OpenDataRequestExistsError,
  PrismaDataRequestsRepository,
  type DataRequestRecord
} from "../../../src/modules/data-requests/data-requests.repository";

const NOW = new Date("2026-10-15T10:00:00.000Z");

function record(overrides: Partial<DataRequestRecord> = {}): DataRequestRecord {
  return {
    id: crypto.randomUUID(),
    reference: `DR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    quoteRequestId: "q1",
    type: "access",
    status: "received",
    locale: "fr",
    dueAt: new Date(NOW.getTime() + 30 * 86_400_000),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

describe("data requests repository: one open request per quote request and type (partial unique index)", () => {
  it("memory: refuses a second open request of the same type, accepts another type, another quote or a closed predecessor", async () => {
    const repository = new MemoryDataRequestsRepository();
    const first = await repository.create(record());
    await expect(repository.create(record())).rejects.toMatchObject({ name: "OpenDataRequestExistsError", reference: first.reference });
    await repository.create(record({ type: "erasure" }));
    await repository.create(record({ quoteRequestId: "q2" }));
    await repository.create(record({ status: "completed" }));
    await repository.transition(first.id, ["received"], { status: "in_review" }, NOW);
    await expect(repository.create(record())).rejects.toBeInstanceOf(OpenDataRequestExistsError);
    await repository.transition(first.id, ["in_review"], { status: "rejected" }, NOW);
    await repository.create(record());
    await expect(repository.create(record({ reference: first.reference, quoteRequestId: "q9" }))).rejects.toBeInstanceOf(DuplicateDataRequestReferenceError);
  });

  /** A table stub that raises the unique violation Prisma raises for the index named in `target`. */
  function prismaRaising(violation: { code: string; meta?: { target?: unknown } }, open?: DataRequestRecord) {
    const table = {
      create: async () => { throw violation; },
      findFirst: async () => open ?? null
    };
    return { requireRuntimeClient: () => ({ dataRequest: table }) } as unknown as PrismaService;
  }

  it("prisma: maps the unique violation of the open index to OpenDataRequestExistsError with the winner's reference", async () => {
    const winner = record({ reference: "DR-WINNER01" });
    for (const target of [["quoteRequestId", "type"], "DataRequest_open_quote_type_key", undefined]) {
      const repository = new PrismaDataRequestsRepository(prismaRaising({ code: "P2002", meta: { target } }, winner));
      await expect(repository.create(record()), JSON.stringify(target)).rejects.toMatchObject({ name: "OpenDataRequestExistsError", reference: "DR-WINNER01" });
    }
  });

  it("prisma: keeps the reference collision a DuplicateDataRequestReferenceError and rethrows anything else", async () => {
    const winner = record();
    for (const target of [["reference"], "DataRequest_reference_key"]) {
      await expect(new PrismaDataRequestsRepository(prismaRaising({ code: "P2002", meta: { target } }, winner)).create(record())).rejects.toBeInstanceOf(DuplicateDataRequestReferenceError);
    }
    // No open twin to blame: it can only be the reference.
    await expect(new PrismaDataRequestsRepository(prismaRaising({ code: "P2002" })).create(record())).rejects.toBeInstanceOf(DuplicateDataRequestReferenceError);
    await expect(new PrismaDataRequestsRepository(prismaRaising({ code: "P1001" })).create(record())).rejects.toMatchObject({ code: "P1001" });
  });
});
