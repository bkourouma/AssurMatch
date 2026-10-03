import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { isTestEnvironment, validateRuntimeEnvironment } from "../../../config/config.module";
import type { AuditEntry } from "../types";

type TransactionCallback<T> = (client: PrismaService) => Promise<T>;

interface PrismaRuntimeClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(callback: () => Promise<T>): Promise<T>;
  [delegate: string]: unknown;
  auditLog?: {
    create(input: { data: Record<string, unknown> }): Promise<unknown>;
  };
  $executeRawUnsafe?(sql: string, ...values: unknown[]): Promise<number>;
}

/**
 * Spec 059 follow-up (M-03): audit rows are written in small batches (one multi-row INSERT per
 * flush) instead of one INSERT per entry; a quote submission writes about fifteen of them.
 * `persistAuditLog` still resolves only once the row is stored, so `writeAsync` keeps its meaning.
 */
const AUDIT_FLUSH_DELAY_MS = 10;
const AUDIT_FLUSH_MAX_ROWS = 200;

/**
 * One statement of FIXED text whatever the batch size: the rows travel as one JSON array parameter.
 * Prisma's `createMany` compiled a new query plan for every distinct row count (its query compiler
 * cost more CPU than the insert itself) and wrapped each batch in a transaction.
 */
const AUDIT_BATCH_INSERT_SQL = `INSERT INTO "AuditLog" ("id", "actorId", "action", "targetType", "targetId", "scope", "result", "reason", "context", "correlationId", "occurredAt", "retentionUntil", "createdAt")
SELECT r."id", r."actorId", r."action", r."targetType", r."targetId", r."scope", r."result"::"AuditResult", r."reason", r."context", r."correlationId",
  r."occurredAt" AT TIME ZONE 'UTC', r."retentionUntil" AT TIME ZONE 'UTC', r."createdAt" AT TIME ZONE 'UTC'
FROM jsonb_to_recordset($1::jsonb) AS r("id" text, "actorId" text, "action" text, "targetType" text, "targetId" text, "scope" jsonb, "result" text, "reason" text, "context" jsonb, "correlationId" text, "occurredAt" timestamptz, "retentionUntil" timestamptz, "createdAt" timestamptz)`;

interface PendingAuditRow {
  data: Record<string, unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface PrismaClientModule {
  PrismaClient?: new (input?: unknown) => PrismaRuntimeClient;
}

export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly connectedAt = new Date();
  readonly runtimeMode = isTestEnvironment() || process.env.ASSURMATCH_PRISMA_MEMORY === "true" ? "test-adapter" : "prisma-client";
  private client?: PrismaRuntimeClient;
  private auditBuffer: PendingAuditRow[] = [];
  private auditFlushTimer: ReturnType<typeof setTimeout> | undefined;

  async onModuleInit(): Promise<void> {
    validateRuntimeEnvironment();
    if (this.runtimeMode !== "prisma-client") return;
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Prisma runtime");
    const adapterModule = await import("@prisma/adapter-pg") as unknown as { PrismaPg: new (input: string) => unknown };
    const prismaModule = await import("@prisma/client") as unknown as PrismaClientModule;
    if (!prismaModule.PrismaClient) throw new Error("@prisma/client PrismaClient is not available");
    this.client = new prismaModule.PrismaClient({ adapter: new adapterModule.PrismaPg(process.env.DATABASE_URL) });
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushAuditLogs();
    await this.client?.$disconnect();
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    if (this.client) return this.client.$transaction(() => callback(this));
    return callback(this);
  }

  get runtimeClient(): PrismaRuntimeClient | undefined {
    return this.client;
  }

  requireRuntimeClient(): PrismaRuntimeClient {
    if (!this.client) throw new Error("Prisma runtime client is not connected");
    return this.client;
  }

  async health(): Promise<"ok" | "degraded"> {
    if (this.runtimeMode === "prisma-client" && (!process.env.DATABASE_URL || !this.client)) return "degraded";
    return "ok";
  }

  async persistAuditLog(entry: AuditEntry): Promise<void> {
    if (!this.client?.auditLog) throw new Error("Prisma audit log repository is not connected");
    const data = {
      id: entry.id,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      scope: entry.scope,
      result: entry.result,
      reason: entry.reason,
      context: entry.context,
      correlationId: entry.correlationId,
      occurredAt: entry.occurredAt,
      retentionUntil: entry.retentionUntil
    };
    if (!this.client.$executeRawUnsafe) {
      await this.client.auditLog.create({ data });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.auditBuffer.push({ data, resolve, reject });
      if (this.auditBuffer.length >= AUDIT_FLUSH_MAX_ROWS) void this.flushAuditLogs();
      else this.auditFlushTimer ??= setTimeout(() => void this.flushAuditLogs(), AUDIT_FLUSH_DELAY_MS);
    });
  }

  /** Writes the buffered audit rows now (also called on shutdown so none is lost). */
  async flushAuditLogs(): Promise<void> {
    if (this.auditFlushTimer) clearTimeout(this.auditFlushTimer);
    this.auditFlushTimer = undefined;
    const batch = this.auditBuffer.splice(0);
    const client = this.client;
    const auditLog = client?.auditLog;
    if (batch.length === 0) return;
    if (!client?.$executeRawUnsafe || !auditLog) {
      for (const item of batch) item.reject(new Error("Prisma audit log repository is not connected"));
      return;
    }
    try {
      const createdAt = new Date().toISOString();
      const rows = batch.map(({ data }) => ({
        ...data,
        occurredAt: data.occurredAt instanceof Date ? data.occurredAt.toISOString() : data.occurredAt,
        retentionUntil: data.retentionUntil instanceof Date ? data.retentionUntil.toISOString() : data.retentionUntil,
        createdAt
      }));
      await client.$executeRawUnsafe(AUDIT_BATCH_INSERT_SQL, JSON.stringify(rows));
      for (const item of batch) item.resolve();
    } catch {
      // One invalid row must not drop the others: retry them one by one.
      for (const item of batch) {
        try {
          await auditLog.create({ data: item.data });
          item.resolve();
        } catch (error) {
          item.reject(error);
        }
      }
    }
  }
}
