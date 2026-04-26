import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AuditEntry } from "../types";

type TransactionCallback<T> = (client: PrismaService) => Promise<T>;

interface PrismaRuntimeClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(callback: () => Promise<T>): Promise<T>;
  auditLog?: {
    create(input: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

interface PrismaClientModule {
  PrismaClient?: new () => PrismaRuntimeClient;
}

export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly connectedAt = new Date();
  readonly runtimeMode = process.env.NODE_ENV === "test" || process.env.ASSURMATCH_PRISMA_MEMORY === "true" ? "test-adapter" : "prisma-client";
  private client?: PrismaRuntimeClient;

  async onModuleInit(): Promise<void> {
    if (this.runtimeMode !== "prisma-client" || !process.env.DATABASE_URL) return;
    const prismaModule = await import("@prisma/client") as unknown as PrismaClientModule;
    if (!prismaModule.PrismaClient) return;
    this.client = new prismaModule.PrismaClient();
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    if (this.client) return this.client.$transaction(() => callback(this));
    return callback(this);
  }

  async health(): Promise<"ok" | "degraded"> {
    if (this.runtimeMode === "prisma-client" && (!process.env.DATABASE_URL || !this.client)) return "degraded";
    return "ok";
  }

  async persistAuditLog(entry: AuditEntry): Promise<void> {
    if (!this.client?.auditLog) throw new Error("Prisma audit log repository is not connected");
    await this.client.auditLog.create({
      data: {
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
      }
    });
  }
}
