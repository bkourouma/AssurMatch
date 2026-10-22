import { auditReliability } from "../observability/audit-metrics";
import { logEvent } from "../observability/structured-logger";
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

/** Spec 075 FR-B1: bounded outbox of entries whose first persistence attempt failed. */
const DEFAULT_OUTBOX_MAX = 2000;
const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const MAX_ATTEMPTS = 20;

export interface AuditWriterOptions {
  outboxMax?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

function outboxLimit(): number {
  const raw = Number(process.env.ASSURMATCH_AUDIT_OUTBOX_MAX);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_OUTBOX_MAX;
}

interface OutboxItem {
  entry: AuditEntry;
  attempts: number;
}

export class AuditLogWriter {
  private readonly entries: AuditEntry[] = [];
  readonly repository: AuditLogRepository;
  readonly runtimeMode: "memory-test" | "durable-boundary";
  /** Process copy bound: unlimited in memory mode (it IS the store), a recent window otherwise. */
  private readonly memoryLimit: number;

  private readonly outbox: OutboxItem[] = [];
  private readonly outboxMax: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private retryDelayMs: number;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private draining: Promise<number> | undefined;

  constructor(repository?: AuditLogRepository, options: AuditWriterOptions = {}) {
    this.repository = repository ?? new MemoryAuditLogRepository();
    this.runtimeMode = this.repository.mode === "prisma-runtime" ? "durable-boundary" : "memory-test";
    if (process.env.ASSURMATCH_AUDIT_MEMORY !== "true") assertRuntimeRepository(this.repository.mode, "AuditLogRepository");
    this.outboxMax = options.outboxMax ?? outboxLimit();
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
    this.retryDelayMs = this.retryBaseMs;
    this.memoryLimit = this.runtimeMode === "durable-boundary" ? durableMemoryLimit() : Number.POSITIVE_INFINITY;
  }

  write(input: AuditWriteInput): AuditEntry {
    const entry = this.createEntry(input);
    this.remember(entry);
    // Lot 8 (FR-B1): a failure is no longer swallowed. It is logged (masked, no context), counted
    // and retried from the bounded outbox. Sensitive actions use writeAsync (fail-closed) instead.
    void this.persist(entry).catch((error: unknown) => this.onWriteFailure(entry, error, 1));
    return entry;
  }

  /** Entries waiting for a retry. */
  get outboxDepth(): number {
    return this.outbox.length;
  }

  /**
   * Retries every outbox entry now (shutdown and tests). Resolves with the number still pending;
   * concurrent calls share one pass.
   */
  drain(): Promise<number> {
    this.draining ??= this.retryPass().finally(() => {
      this.draining = undefined;
    });
    return this.draining;
  }

  private persist(entry: AuditEntry): Promise<void> {
    return (async () => {
      await this.repository.persist(entry);
    })();
  }

  private onWriteFailure(entry: AuditEntry, error: unknown, attempts: number): void {
    auditReliability.recordPersistFailure();
    // No context, no identifier, no error message: names only, so the log cannot carry PII.
    logEvent("error", "audit.persist_failed", {
      action: entry.action,
      targetType: entry.targetType,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    if (attempts >= MAX_ATTEMPTS) {
      this.drop(entry);
      return;
    }
    if (this.outbox.length >= this.outboxMax) {
      const oldest = this.outbox.shift();
      auditReliability.adjustOutboxDepth(-1);
      if (oldest) this.drop(oldest.entry);
    }
    this.outbox.push({ entry, attempts });
    auditReliability.adjustOutboxDepth(1);
    this.scheduleRetry();
  }

  private drop(entry: AuditEntry): void {
    auditReliability.recordDropped();
    logEvent("error", "audit.dropped", { action: entry.action, targetType: entry.targetType });
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.outbox.length === 0) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.drain();
    }, this.retryDelayMs);
    // Never keep the process alive for a retry: shutdown calls drain() explicitly.
    this.retryTimer.unref?.();
  }

  private async retryPass(): Promise<number> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const pending = this.outbox.splice(0);
    auditReliability.adjustOutboxDepth(-pending.length);
    let failed = false;
    for (const item of pending) {
      try {
        await this.persist(item.entry);
      } catch (error) {
        failed = true;
        this.onWriteFailure(item.entry, error, item.attempts + 1);
      }
    }
    this.retryDelayMs = failed ? Math.min(this.retryDelayMs * 2, this.retryMaxMs) : this.retryBaseMs;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.scheduleRetry();
    return this.outbox.length;
  }

  async writeAsync(input: AuditWriteInput): Promise<AuditEntry> {
    const entry = this.createEntry(input);
    this.remember(entry);
    // Fail-closed: the caller sees the error; nothing goes to the outbox.
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
