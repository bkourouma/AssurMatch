import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const VISIT_STATS_REPOSITORY = Symbol("VISIT_STATS_REPOSITORY");

/** One aggregated row: a UTC day, a page key and a count. Nothing else is ever stored (spec 073 FR-006). */
export interface VisitCounterRow {
  day: Date;
  page: string;
  count: number;
}

export interface VisitStatsRepository extends RuntimeRepository {
  /** Atomically adds one to the `(day, page)` counter, creating it at 1 when absent. */
  increment(day: Date, page: string): Promise<void>;
  /** Rows whose day lies in `[fromDay, toDay]` (UTC days, inclusive). */
  listBetween(fromDay: Date, toDay: Date): Promise<VisitCounterRow[]>;
}

/** Truncates an instant to its UTC day (midnight), the value stored in `VisitCounter.day`. */
export function utcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

export class MemoryVisitStatsRepository implements VisitStatsRepository {
  readonly mode = "memory-test" as const;
  private readonly counters = new Map<string, VisitCounterRow>();

  constructor() {
    assertRuntimeRepository(this.mode, "VisitStatsRepository");
  }

  async increment(day: Date, page: string): Promise<void> {
    const key = `${day.toISOString().slice(0, 10)}|${page}`;
    const current = this.counters.get(key);
    if (current) current.count += 1;
    else this.counters.set(key, { day: new Date(day), page, count: 1 });
  }

  async listBetween(fromDay: Date, toDay: Date): Promise<VisitCounterRow[]> {
    return [...this.counters.values()]
      .filter((row) => row.day.getTime() >= fromDay.getTime() && row.day.getTime() <= toDay.getTime())
      .map((row) => ({ ...row, day: new Date(row.day) }));
  }
}

interface VisitCounterDelegate {
  upsert(input: {
    where: { day_page: { day: Date; page: string } };
    create: { day: Date; page: string; count: number };
    update: { count: { increment: number } };
  }): Promise<unknown>;
  findMany(input: { where: { day: { gte: Date; lte: Date } } }): Promise<VisitCounterRow[]>;
}

export class PrismaVisitStatsRepository implements VisitStatsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async increment(day: Date, page: string): Promise<void> {
    // `upsert` with `increment` is one INSERT ... ON CONFLICT DO UPDATE count = count + 1: atomic.
    await this.client().upsert({
      where: { day_page: { day, page } },
      create: { day, page, count: 1 },
      update: { count: { increment: 1 } }
    });
  }

  async listBetween(fromDay: Date, toDay: Date): Promise<VisitCounterRow[]> {
    const rows = await this.client().findMany({ where: { day: { gte: fromDay, lte: toDay } } });
    return rows.map((row) => ({ day: row.day, page: row.page, count: row.count }));
  }

  private client(): VisitCounterDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { visitCounter: VisitCounterDelegate }).visitCounter;
  }
}
