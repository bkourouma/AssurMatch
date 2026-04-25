import type { PrismaService } from "../common/prisma/prisma.service";
import type { InMemoryRedisClient } from "../common/redis/redis.module";
import type { InMemoryQueue } from "../common/queues/queues.module";

export interface SystemHealth {
  status: "ok" | "degraded" | "down";
  checks: Record<string, "ok" | "degraded" | "down">;
}

export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: InMemoryRedisClient,
    private readonly queue: InMemoryQueue
  ) {}

  async check(): Promise<SystemHealth> {
    const checks: Record<string, "ok" | "degraded" | "down"> = {
      database: await this.prisma.health(),
      redis: await this.redis.health(),
      queue: this.queue.list().some((job) => job.status === "failed") ? "degraded" : "ok",
      documents: "ok",
      auth: "ok",
      featureFlags: "ok"
    };
    const status = Object.values(checks).includes("down") ? "down" : Object.values(checks).includes("degraded") ? "degraded" : "ok";
    return { status, checks };
  }
}

export class SystemHealthModule {
  readonly service: SystemHealthService;

  constructor(prisma: PrismaService, redis: InMemoryRedisClient, queue: InMemoryQueue) {
    this.service = new SystemHealthService(prisma, redis, queue);
  }
}
