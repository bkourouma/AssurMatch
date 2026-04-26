import type { AuditEntry } from "../common/types";
import type { PrismaService } from "../common/prisma/prisma.service";

export interface AuditLogRepository {
  readonly mode: "memory-test" | "prisma-runtime";
  persist(entry: AuditEntry): void | Promise<void>;
  all?(): AuditEntry[];
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
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  persist(entry: AuditEntry): Promise<void> {
    return this.prisma.persistAuditLog(entry);
  }
}

