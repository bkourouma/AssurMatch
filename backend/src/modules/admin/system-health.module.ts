import type { PrismaService } from "../common/prisma/prisma.service";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { QueuePort } from "../common/queues/queues.module";

export interface SystemHealth {
  status: "ok" | "degraded" | "down";
  checks: Record<string, "ok" | "degraded" | "down">;
}

export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisClientPort,
    private readonly queue: QueuePort
  ) {}

  async check(): Promise<SystemHealth> {
    const checks: Record<string, "ok" | "degraded" | "down"> = {
      database: await this.prisma.health(),
      redis: await this.redis.health(),
      queue: this.queue.health(),
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

  constructor(prisma: PrismaService, redis: RedisClientPort, queue: QueuePort) {
    this.service = new SystemHealthService(prisma, redis, queue);
  }
}
