import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { PrismaContentCmsRepository, type ContentEntryGuard, type ContentEntryRecord } from "../../../src/modules/content-cms/content-cms.repository";

/**
 * Lot 9 (spec 072): the Prisma repository against a simulated `contentEntry` delegate. The fake
 * client keeps a committed table; `$transaction` runs the callback on a working copy handed over as
 * `tx`, commits it on success and drops it when the callback throws, like an interactive Prisma
 * transaction. Conditional writes (`updateMany`) through the root client, outside `tx`, are refused,
 * so a write that escapes the transaction fails the test instead of silently committing.
 */

type Row = ContentEntryRecord & Record<string, unknown>;
type Where = Record<string, unknown>;

function clone(row: Row): Row {
  return { ...row, payload: structuredClone(row.payload) };
}

function same(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  return left === right;
}

/** The subset of the Prisma filter syntax the repository uses, with SQL NULL semantics for `not`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "AND") return (condition as Where[]).every((part) => matches(row, part));
    const value = row[field] ?? null;
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const filter = condition as { not?: unknown; in?: unknown[] };
      if ("in" in filter) return (filter.in ?? []).some((candidate) => same(value, candidate));
      if ("not" in filter) return filter.not === null ? value !== null : value !== null && !same(value, filter.not);
    }
    return same(value, condition ?? null);
  });
}

interface FakeOptions {
  /** Throws this error on the n-th (1-based) `updateMany` inside a transaction. */
  failUpdateMany?: { call: number; error: Error };
}

function fakePrisma(initial: Row[], options: FakeOptions = {}) {
  let committed = initial.map(clone);
  const log: string[] = [];
  let transactions = 0;

  function delegate(rows: () => Row[], scope: "tx" | "root") {
    let updateManyCalls = 0;
    const refuseOutsideTx = (operation: string) => {
      if (scope === "root") throw new Error(`write ${operation} outside the transaction`);
    };
    return {
      async create(input: { data: Row }) {
        rows().push(clone(input.data));
        return clone(input.data);
      },
      async updateMany(input: { where: Where; data: Partial<Row> }) {
        refuseOutsideTx("updateMany");
        updateManyCalls += 1;
        log.push(`updateMany#${updateManyCalls}`);
        if (options.failUpdateMany?.call === updateManyCalls) throw options.failUpdateMany.error;
        let count = 0;
        for (const row of rows()) {
          if (!matches(row, input.where)) continue;
          Object.assign(row, input.data);
          count += 1;
        }
        return { count };
      },
      async findUnique(input: { where: { id: string } }) {
        const row = rows().find((candidate) => candidate.id === input.where.id);
        return row ? clone(row) : null;
      },
      async findFirst(input: { where: Where }) {
        const row = rows().find((candidate) => matches(candidate, input.where));
        return row ? clone(row) : null;
      },
      async findMany(input: { where?: Where } = {}) {
        return rows().filter((candidate) => matches(candidate, input.where ?? {})).map(clone);
      },
      async aggregate(input: { where: Where }) {
        const versions = rows().filter((candidate) => matches(candidate, input.where)).map((row) => row.version);
        return { _max: { version: versions.length > 0 ? Math.max(...versions) : null } };
      }
    };
  }

  const client = {
    contentEntry: delegate(() => committed, "root"),
    async $transaction<T>(callback: (tx: { contentEntry: ReturnType<typeof delegate> }) => Promise<T>): Promise<T> {
      transactions += 1;
      const working = committed.map(clone);
      const result = await callback({ contentEntry: delegate(() => working, "tx") });
      committed = working;
      return result;
    }
  };
  const prisma = { requireRuntimeClient: () => client } as unknown as PrismaService;
  return {
    prisma,
    log,
    transactions: () => transactions,
    row: (id: string) => committed.find((candidate) => candidate.id === id),
    statuses: () => Object.fromEntries(committed.map((row) => [row.id, row.status]))
  };
}

const T0 = new Date(Date.UTC(2026, 9, 22, 9, 0, 0));
const T1 = new Date(Date.UTC(2026, 9, 22, 10, 0, 0));
const PUBLISHED_AT = new Date(Date.UTC(2026, 9, 22, 11, 0, 0));

function entry(overrides: Partial<Row> & Pick<Row, "id" | "version" | "status">): Row {
  return {
    kind: "faq",
    entryKey: "devis-auto",
    locale: "fr",
    countryCode: null,
    label: "Question",
    payload: { question: "Question ?", answer: "Réponse." },
    basedOnId: null,
    createdById: "author-1",
    createdAt: T0,
    updatedAt: T0,
    submittedById: null,
    submittedAt: null,
    decidedById: null,
    decidedAt: null,
    decisionNote: null,
    publishedAt: null,
    ...overrides
  } as Row;
}

/** v1 published, v2 pending review (submitted by author-1 at T1). */
function revisionTable(): Row[] {
  return [
    entry({ id: "v1", version: 1, status: "published", publishedAt: T0 }),
    entry({ id: "v2", version: 2, status: "pending_review", basedOnId: "v1", submittedById: "author-1", submittedAt: T1, updatedAt: T1 })
  ];
}

const guard: ContentEntryGuard = { status: "pending_review", updatedAt: T1, submittedByNot: "approver-1" };
const publication = { publishedAt: PUBLISHED_AT, decidedById: "approver-1", note: "Relu" };

describe("PrismaContentCmsRepository (simulated delegate)", () => {
  it("publishes in one interactive transaction on tx: previous version archived, new one published", async () => {
    const fake = fakePrisma(revisionTable());
    const repository = new PrismaContentCmsRepository(fake.prisma);
    const published = await repository.publishExclusively("v2", guard, publication);
    expect(published).toMatchObject({ id: "v2", status: "published", decidedById: "approver-1", decisionNote: "Relu", publishedAt: PUBLISHED_AT, updatedAt: PUBLISHED_AT });
    expect(fake.statuses()).toEqual({ v1: "archived", v2: "published" });
    expect(fake.row("v1")?.updatedAt).toEqual(PUBLISHED_AT);
    expect(fake.transactions()).toBe(1);
    // Archive first (partial unique index on published), then the guarded publication.
    expect(fake.log).toEqual(["updateMany#1", "updateMany#2"]);
  });

  it("rolls the archiving back when the second write fails", async () => {
    const failure = new Error("simulated database failure on the publication write");
    const fake = fakePrisma(revisionTable(), { failUpdateMany: { call: 2, error: failure } });
    const repository = new PrismaContentCmsRepository(fake.prisma);
    await expect(repository.publishExclusively("v2", guard, publication)).rejects.toBe(failure);
    // The first write (archiving v1) ran inside the transaction but was not committed.
    expect(fake.log).toEqual(["updateMany#1", "updateMany#2"]);
    expect(fake.statuses()).toEqual({ v1: "published", v2: "pending_review" });
    expect(fake.row("v1")?.updatedAt).toEqual(T0);
  });

  it("rolls the archiving back on a unique violation of the published index and reports a stale write", async () => {
    const fake = fakePrisma(revisionTable(), { failUpdateMany: { call: 2, error: Object.assign(new Error("Unique constraint failed"), { code: "P2002" }) } });
    const repository = new PrismaContentCmsRepository(fake.prisma);
    expect(await repository.publishExclusively("v2", guard, publication)).toBeUndefined();
    expect(fake.statuses()).toEqual({ v1: "published", v2: "pending_review" });
  });

  it("publishes nothing and archives nothing when the guard no longer matches", async () => {
    const cases: ContentEntryGuard[] = [
      // Changed since read (withdrawn, edited, resubmitted...).
      { ...guard, updatedAt: T0 },
      // No longer pending review.
      { ...guard, status: "draft" },
      // Four eyes: the approver is the stored submitter.
      { ...guard, submittedByNot: "author-1" }
    ];
    for (const stale of cases) {
      const fake = fakePrisma(revisionTable());
      const repository = new PrismaContentCmsRepository(fake.prisma);
      expect(await repository.publishExclusively("v2", stale, publication), JSON.stringify(stale)).toBeUndefined();
      expect(fake.statuses(), JSON.stringify(stale)).toEqual({ v1: "published", v2: "pending_review" });
      expect(fake.row("v1")?.updatedAt).toEqual(T0);
    }
  });

  it("never treats an unknown submitter as another actor", async () => {
    const table = revisionTable();
    table[1] = { ...table[1]!, submittedById: null };
    const fake = fakePrisma(table);
    const repository = new PrismaContentCmsRepository(fake.prisma);
    expect(await repository.publishExclusively("v2", guard, publication)).toBeUndefined();
    expect(fake.statuses()).toEqual({ v1: "published", v2: "pending_review" });
  });

  it("transition writes only when status and updatedAt still match, through the transaction client", async () => {
    const fake = fakePrisma(revisionTable());
    const repository = new PrismaContentCmsRepository(fake.prisma);
    const later = new Date(T1.getTime() + 1);
    expect(await repository.transition("v2", { status: "pending_review", updatedAt: T0 }, { status: "draft", updatedAt: later })).toBeUndefined();
    expect(await repository.transition("v2", { status: "draft", updatedAt: T1 }, { status: "archived", updatedAt: later })).toBeUndefined();
    expect(fake.row("v2")?.status).toBe("pending_review");
    const withdrawn = await repository.transition("v2", { status: "pending_review", updatedAt: T1 }, { status: "draft", submittedById: null, submittedAt: null, updatedAt: later });
    expect(withdrawn).toMatchObject({ id: "v2", status: "draft", submittedById: null, updatedAt: later });
    // The same stale guard cannot apply twice.
    expect(await repository.transition("v2", { status: "pending_review", updatedAt: T1 }, { status: "draft", updatedAt: later })).toBeUndefined();
    expect(await repository.transition("missing", { status: "draft", updatedAt: T1 }, { status: "archived", updatedAt: later })).toBeUndefined();
  });
});
