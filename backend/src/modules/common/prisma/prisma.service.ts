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
}

interface PrismaClientModule {
  PrismaClient?: new (input?: unknown) => PrismaRuntimeClient;
}

export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly connectedAt = new Date();
  readonly runtimeMode = isTestEnvironment() || process.env.ASSURMATCH_PRISMA_MEMORY === "true" ? "test-adapter" : "prisma-client";
  private client?: PrismaRuntimeClient;

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
