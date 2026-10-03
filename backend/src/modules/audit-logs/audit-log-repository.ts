import type { AuditEntry, AuditResult } from "../common/types";
import type { PrismaService } from "../common/prisma/prisma.service";

/** Spec 056: admin audit-log search. `action` is a prefix; `from`/`to` bound `occurredAt` inclusively. */
export interface AuditLogSearchFilter {
  actorId?: string | undefined;
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  result?: AuditResult | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface AuditLogSearchPage {
  /** Zero-based offset and maximum number of rows. */
  skip: number;
  take: number;
}

export interface AuditLogSearchResult {
  items: AuditEntry[];
  total: number;
}

export interface AuditLogRepository {
  readonly mode: "memory-test" | "prisma-runtime";
  persist(entry: AuditEntry): void | Promise<void>;
  all?(): AuditEntry[];
  /** Spec 056: newest first. Optional so lightweight test doubles keep compiling. */
  search?(filter: AuditLogSearchFilter, page: AuditLogSearchPage): Promise<AuditLogSearchResult>;
}

export function matchesAuditFilter(entry: AuditEntry, filter: AuditLogSearchFilter): boolean {
  if (filter.actorId && entry.actorId !== filter.actorId) return false;
  if (filter.action && !entry.action.startsWith(filter.action)) return false;
  if (filter.targetType && entry.targetType !== filter.targetType) return false;
  if (filter.targetId && entry.targetId !== filter.targetId) return false;
  if (filter.result && entry.result !== filter.result) return false;
  if (filter.from && entry.occurredAt.getTime() < filter.from.getTime()) return false;
  if (filter.to && entry.occurredAt.getTime() > filter.to.getTime()) return false;
  return true;
}

/** Newest first, stable for entries written in the same millisecond (later writes first). */
export function searchAuditEntries(entries: AuditEntry[], filter: AuditLogSearchFilter, page: AuditLogSearchPage): AuditLogSearchResult {
  const matching = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => matchesAuditFilter(entry, filter))
    .sort((a, b) => b.entry.occurredAt.getTime() - a.entry.occurredAt.getTime() || b.index - a.index)
    .map(({ entry }) => entry);
  return { items: matching.slice(page.skip, page.skip + page.take), total: matching.length };
}

export class MemoryAuditLogRepository implements AuditLogRepository {
  readonly mode = "memory-test" as const;
  private readonly entries: AuditEntry[] = [];

  persist(entry: AuditEntry): void {
    this.entries.push(entry);
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }

  async search(filter: AuditLogSearchFilter, page: AuditLogSearchPage): Promise<AuditLogSearchResult> {
    return searchAuditEntries(this.entries, filter, page);
  }
}

type AuditLogDelegate = {
  findMany(input: unknown): Promise<unknown[]>;
  count(input: unknown): Promise<number>;
};

interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  scope: unknown;
  result: AuditResult;
  reason: string | null;
  context: unknown;
  correlationId: string | null;
  occurredAt: Date;
  retentionUntil: Date;
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  persist(entry: AuditEntry): Promise<void> {
    return this.prisma.persistAuditLog(entry);
  }

  async search(filter: AuditLogSearchFilter, page: AuditLogSearchPage): Promise<AuditLogSearchResult> {
    const occurredAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {})
    };
    const where = {
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action ? { action: { startsWith: filter.action } } : {}),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.result ? { result: filter.result } : {}),
      ...(Object.keys(occurredAt).length > 0 ? { occurredAt } : {})
    };
    const client = this.client();
    const [rows, total] = await Promise.all([
      client.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: page.skip, take: page.take }),
      client.count({ where })
    ]);
    return { items: (rows as AuditLogRow[]).map((row) => this.toDomain(row)), total };
  }

  private client(): AuditLogDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { auditLog: AuditLogDelegate }).auditLog;
  }

  private toDomain(row: AuditLogRow): AuditEntry {
    return {
      id: row.id,
      ...(row.actorId ? { actorId: row.actorId } : {}),
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      scope: isRecord(row.scope) ? row.scope : {},
      result: row.result,
      ...(row.reason ? { reason: row.reason } : {}),
      context: isRecord(row.context) ? row.context : {},
      ...(row.correlationId ? { correlationId: row.correlationId } : {}),
      occurredAt: row.occurredAt,
      retentionUntil: row.retentionUntil
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
