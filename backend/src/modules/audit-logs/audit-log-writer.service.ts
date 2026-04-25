import { maskPii } from "../common/logging/pii-masker";
import type { ActorContext, AuditEntry, AuditResult } from "../common/types";

export interface AuditWriteInput {
  actor?: ActorContext;
  action: string;
  targetType: string;
  targetId: string;
  scope?: Record<string, unknown>;
  result: AuditResult;
  reason?: string;
  context?: Record<string, unknown>;
  retentionUntil?: Date;
}

export class AuditLogWriter {
  private readonly entries: AuditEntry[] = [];

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
