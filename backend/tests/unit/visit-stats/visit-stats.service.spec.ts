import { afterEach, describe, expect, it } from "vitest";
import { VISIT_PAGE_KEYS, visitRecordInputSchema } from "../../../../packages/shared/contracts/visit-stats.contracts";
import { MemoryVisitStatsRepository, utcDay } from "../../../src/modules/visit-stats/visit-stats.repository";
import { VisitStatsService } from "../../../src/modules/visit-stats/visit-stats.service";

function clock(start: string) {
  let current = new Date(start);
  return { now: () => current, set: (value: string) => { current = new Date(value); } };
}

describe("visit stats contract (spec 073 FR-007)", () => {
  it("accepts only the closed list of page keys and nothing else in the body", () => {
    expect(VISIT_PAGE_KEYS).toEqual(["home", "countries", "country", "product", "offers", "offer", "compare", "quote_form", "quote_submitted", "tracking", "other"]);
    for (const page of VISIT_PAGE_KEYS) expect(visitRecordInputSchema.safeParse({ page }).success).toBe(true);
    expect(visitRecordInputSchema.safeParse({ page: "/pays/CI" }).success).toBe(false);
    expect(visitRecordInputSchema.safeParse({ page: "home", url: "https://x" }).success).toBe(false);
    expect(visitRecordInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("VisitStatsService", () => {
  afterEach(() => {
    delete process.env.ASSURMATCH_VISIT_COUNTER_ENABLED;
  });

  it("refuses a key outside the closed list and stores nothing", async () => {
    const repository = new MemoryVisitStatsRepository();
    const service = new VisitStatsService(repository);
    await expect(service.record("/pays/CI?ref=abc")).rejects.toThrow("Unknown page key");
    expect((await service.totalsBetween(new Date("2000-01-01"), new Date("2100-01-01"))).total).toBe(0);
  });

  it("counts page views per day and page, and totalsBetween lists every key", async () => {
    const time = clock("2026-10-20T10:00:00.000Z");
    const service = new VisitStatsService(new MemoryVisitStatsRepository(), { now: time.now });
    await service.record("home");
    await service.record("home");
    await service.record("offers");
    time.set("2026-10-21T23:59:00.000Z");
    await service.record("home");
    time.set("2026-10-23T00:01:00.000Z");
    await service.record("compare");

    const totals = await service.totalsBetween(new Date("2026-10-20T12:00:00.000Z"), new Date("2026-10-22T00:00:00.000Z"));
    expect(totals.total).toBe(4);
    expect(totals.byPage).toHaveLength(VISIT_PAGE_KEYS.length);
    expect(totals.byPage.find((entry) => entry.page === "home")?.total).toBe(3);
    expect(totals.byPage.find((entry) => entry.page === "offers")?.total).toBe(1);
    expect(totals.byPage.find((entry) => entry.page === "compare")?.total).toBe(0);
    const all = await service.totalsBetween(new Date("2026-10-20T00:00:00.000Z"), new Date("2026-10-23T12:00:00.000Z"));
    expect(all.total).toBe(5);
  });

  it("applies a global per-page, per-minute ceiling that resets with the minute", async () => {
    const time = clock("2026-10-20T10:00:10.000Z");
    const service = new VisitStatsService(new MemoryVisitStatsRepository(), { now: time.now, maxPerPagePerMinute: 3 });
    const outcomes = [];
    for (let index = 0; index < 5; index += 1) outcomes.push(await service.record("home"));
    expect(outcomes).toEqual(["recorded", "recorded", "recorded", "throttled", "throttled"]);
    expect(await service.record("offers")).toBe("recorded");
    time.set("2026-10-20T10:01:00.000Z");
    expect(await service.record("home")).toBe("recorded");
    const totals = await service.totalsBetween(new Date("2026-10-20T00:00:00.000Z"), new Date("2026-10-20T23:00:00.000Z"));
    expect(totals.total).toBe(5);
  });

  it("does nothing when ASSURMATCH_VISIT_COUNTER_ENABLED=false", async () => {
    process.env.ASSURMATCH_VISIT_COUNTER_ENABLED = "false";
    const service = new VisitStatsService(new MemoryVisitStatsRepository());
    expect(await service.record("home")).toBe("disabled");
    expect((await service.totalsBetween(new Date("2000-01-01"), new Date("2100-01-01"))).total).toBe(0);
  });
});

describe("MemoryVisitStatsRepository", () => {
  it("keeps only a UTC day, a page key and a count per row", async () => {
    const repository = new MemoryVisitStatsRepository();
    const day = utcDay(new Date("2026-10-20T18:30:00.000Z"));
    await repository.increment(day, "home");
    await repository.increment(day, "home");
    await repository.increment(day, "tracking");
    const rows = await repository.listBetween(day, day);
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([["count", "day", "page"], ["count", "day", "page"]]);
    expect(rows.find((row) => row.page === "home")?.count).toBe(2);
    expect(day.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(await repository.listBetween(new Date("2026-10-21T00:00:00.000Z"), new Date("2026-10-22T00:00:00.000Z"))).toEqual([]);
  });
});
