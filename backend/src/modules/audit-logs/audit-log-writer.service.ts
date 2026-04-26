import { maskPii } from "../common/logging/pii-masker";
import type { ActorContext, AuditEntry, AuditResult } from "../common/types";
import { MemoryAuditLogRepository, type AuditLogRepository } from "./audit-log-repository";

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

export class AuditLogWriter {
  private readonly entries: AuditEntry[] = [];
  readonly repository: AuditLogRepository;
  readonly runtimeMode: "memory-test" | "durable-boundary";

  constructor(repository?: AuditLogRepository) {
    this.repository = repository ?? new MemoryAuditLogRepository();
    this.runtimeMode = this.repository.mode === "prisma-runtime" ? "durable-boundary" : "memory-test";
  }

  write(input: AuditWriteInput): AuditEntry {
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
    this.entries.push(entry);
    Promise.resolve(this.repository.persist(entry)).catch(() => undefined);
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
}
