import { maskPii } from "../common/logging/pii-masker";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { ActorContext, AuditEntry, AuditResult } from "../common/types";
import { MemoryAuditLogRepository, searchAuditEntries, type AuditLogRepository, type AuditLogSearchFilter, type AuditLogSearchPage, type AuditLogSearchResult } from "./audit-log-repository";

export interface AuditWriteInput {
  actor?: ActorContext | undefined;
  action: string;
  targetType: string;
  targetId: string;
  scope?: Record<string, unknown> | undefined;
  result: AuditResult;
  reason?: string | undefined;
  context?: Record<string, unknown> | undefined;
  retentionUntil?: Date | undefined;
}

/**
 * Spec 059 follow-up (M-03): with a durable repository the process copy is only a recent window
 * (the in-process dashboards read it); it used to keep every entry since start, an unbounded heap
 * that the garbage collector had to walk on every request. The durable table stays the record.
 */
const DEFAULT_DURABLE_MEMORY_ENTRIES = 5000;

function durableMemoryLimit(): number {
  const raw = Number(process.env.ASSURMATCH_AUDIT_MEMORY_MAX_ENTRIES);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_DURABLE_MEMORY_ENTRIES;
}

export class AuditLogWriter {
  private readonly entries: AuditEntry[] = [];
  readonly repository: AuditLogRepository;
  readonly runtimeMode: "memory-test" | "durable-boundary";
  /** Process copy bound: unlimited in memory mode (it IS the store), a recent window otherwise. */
  private readonly memoryLimit: number;

  constructor(repository?: AuditLogRepository) {
    this.repository = repository ?? new MemoryAuditLogRepository();
    this.runtimeMode = this.repository.mode === "prisma-runtime" ? "durable-boundary" : "memory-test";
    if (process.env.ASSURMATCH_AUDIT_MEMORY !== "true") assertRuntimeRepository(this.repository.mode, "AuditLogRepository");
    this.memoryLimit = this.runtimeMode === "durable-boundary" ? durableMemoryLimit() : Number.POSITIVE_INFINITY;
  }

  write(input: AuditWriteInput): AuditEntry {
    const entry = this.createEntry(input);
    this.remember(entry);
    Promise.resolve(this.repository.persist(entry)).catch(() => undefined);
    return entry;
  }

  async writeAsync(input: AuditWriteInput): Promise<AuditEntry> {
    const entry = this.createEntry(input);
    this.remember(entry);
    await this.repository.persist(entry);
    return entry;
  }

  private remember(entry: AuditEntry): void {
    this.entries.push(entry);
    // Trimmed in chunks (10 %) so the splice cost is amortised.
    if (this.entries.length > this.memoryLimit) this.entries.splice(0, this.entries.length - Math.floor(this.memoryLimit * 0.9));
  }

  private createEntry(input: AuditWriteInput): AuditEntry {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      ...(input.actor?.actorId ? { actorId: input.actor.actorId } : {}),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      scope: input.scope ?? {},
      result: input.result,
      ...(input.reason ? { reason: input.reason } : {}),
      context: maskPii(input.context ?? {}),
      ...(input.actor?.correlationId ? { correlationId: input.actor.correlationId } : {}),
      occurredAt: new Date(),
      retentionUntil: input.retentionUntil ?? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
    };
    return entry;
  }

  search(filters: Partial<Pick<AuditEntry, "action" | "result" | "targetType" | "targetId">> = {}): AuditEntry[] {
    return this.entries.filter((entry) =>
      Object.entries(filters).every(([key, value]) => value === undefined || entry[key as keyof AuditEntry] === value)
    );
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * Spec 056: reads the durable store (the `AuditLog` table at runtime) instead of the entries this
   * process happens to have written since it started. Falls back to the process entries only for a
   * repository double that does not implement `search`.
   */
  async searchDurable(filter: AuditLogSearchFilter, page: AuditLogSearchPage): Promise<AuditLogSearchResult> {
    if (this.repository.search) return this.repository.search(filter, page);
    return searchAuditEntries(this.entries, filter, page);
  }
}
