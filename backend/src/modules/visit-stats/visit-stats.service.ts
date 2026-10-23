import { BadRequestException } from "@nestjs/common";
import { VISIT_PAGE_KEYS, isVisitPageKey, type VisitTotals } from "../../../../packages/shared/contracts/visit-stats.contracts";
import { MemoryVisitStatsRepository, utcDay, type VisitStatsRepository } from "./visit-stats.repository";

/** Anti-inflation ceiling: visits accepted per page and per minute, all visitors together. */
export const DEFAULT_VISITS_PER_PAGE_PER_MINUTE = 600;
const WINDOW_MS = 60_000;

export interface VisitStatsOptions {
  /** Defaults to `ASSURMATCH_VISIT_COUNTER_ENABLED` (anything but "false" means enabled). */
  enabled?: () => boolean;
  /** Defaults to `ASSURMATCH_VISIT_COUNTER_MAX_PER_MINUTE`, then 600. */
  maxPerPagePerMinute?: number;
  now?: () => Date;
}

export type VisitRecordOutcome = "recorded" | "disabled" | "throttled";

function envEnabled(): boolean {
  return (process.env.ASSURMATCH_VISIT_COUNTER_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

function envLimit(): number {
  const parsed = Number(process.env.ASSURMATCH_VISIT_COUNTER_MAX_PER_MINUTE);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_VISITS_PER_PAGE_PER_MINUTE;
}

/**
 * Spec 073 FR-007 / FR-009 (hypothesis H5): page-view counter. Nothing identifies the visitor: the
 * ceiling is global per page and per minute (one minute-bucket counter per page held in memory), and
 * the repository only ever receives a UTC day and a page key.
 */
export class VisitStatsService {
  private readonly buckets = new Map<string, { minute: number; count: number }>();
  private readonly enabled: () => boolean;
  private readonly now: () => Date;
  private readonly limit: number;

  constructor(private readonly repository: VisitStatsRepository = new MemoryVisitStatsRepository(), options: VisitStatsOptions = {}) {
    this.enabled = options.enabled ?? envEnabled;
    this.now = options.now ?? (() => new Date());
    this.limit = options.maxPerPagePerMinute ?? envLimit();
  }

  /** Counts one page view. Throws 400 for a key outside the closed list. */
  async record(page: string): Promise<VisitRecordOutcome> {
    if (!isVisitPageKey(page)) throw new BadRequestException("Unknown page key");
    if (!this.enabled()) return "disabled";
    const instant = this.now();
    if (!this.admit(page, instant)) return "throttled";
    await this.repository.increment(utcDay(instant), page);
    return "recorded";
  }

  /** Page views between two instants (UTC days, inclusive), total and per page; every key is listed. */
  async totalsBetween(from: Date, to: Date): Promise<VisitTotals> {
    const rows = await this.repository.listBetween(utcDay(from), utcDay(to));
    const perPage = new Map<string, number>(VISIT_PAGE_KEYS.map((key) => [key, 0]));
    for (const row of rows) perPage.set(row.page, (perPage.get(row.page) ?? 0) + row.count);
    const byPage = VISIT_PAGE_KEYS.map((page) => ({ page, total: perPage.get(page) ?? 0 }));
    return { total: byPage.reduce((sum, entry) => sum + entry.total, 0), byPage };
  }

  private admit(page: string, instant: Date): boolean {
    const minute = Math.floor(instant.getTime() / WINDOW_MS);
    const bucket = this.buckets.get(page);
    if (!bucket || bucket.minute !== minute) {
      this.buckets.set(page, { minute, count: 1 });
      return true;
    }
    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }
}
