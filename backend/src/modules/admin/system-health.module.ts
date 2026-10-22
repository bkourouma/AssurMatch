import { auditReliability, type AuditReliabilitySnapshot } from "../observability/audit-metrics";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { QueuePort } from "../common/queues/queues.module";

export interface SystemHealth {
  status: "ok" | "degraded" | "down";
  checks: Record<string, "ok" | "degraded" | "down">;
  /** Lot 8 (FR-B1): audit pipeline counters (numbers only). */
  audit: AuditReliabilitySnapshot;
}

/** Audit rows lost within this window keep the audit check degraded; older losses are only in the counters. */
export const AUDIT_DROPPED_WINDOW_MS = 15 * 60 * 1000;

export class SystemHealthService {
  private lastDropped: number;
  private lastDropAt: number | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisClientPort,
    private readonly queue: QueuePort,
    private readonly now: () => number = Date.now,
    private readonly droppedWindowMs: number = AUDIT_DROPPED_WINDOW_MS
  ) {
    this.lastDropped = auditReliability.snapshot().auditDropped;
  }

  /** `auditDropped` is cumulative: only a recent increase (since the last poll, within the window) is degraded. */
  private recentlyDropped(dropped: number): boolean {
    const at = this.now();
    if (dropped !== this.lastDropped) {
      if (dropped > this.lastDropped) this.lastDropAt = at;
      this.lastDropped = dropped;
    }
    return this.lastDropAt !== undefined && at - this.lastDropAt < this.droppedWindowMs;
  }

  async check(): Promise<SystemHealth> {
    const audit = auditReliability.snapshot();
    const checks: Record<string, "ok" | "degraded" | "down"> = {
      database: await this.prisma.health(),
      redis: await this.redis.health(),
      queue: this.queue.health(),
      documents: "ok",
      auth: "ok",
      featureFlags: "ok",
      // Lot 8: degraded while audit rows wait for a retry or when some were lost recently (cumulative count stays in `audit`).
      audit: audit.auditOutboxDepth > 0 || this.recentlyDropped(audit.auditDropped) ? "degraded" : "ok"
    };
    const status = Object.values(checks).includes("down") ? "down" : Object.values(checks).includes("degraded") ? "degraded" : "ok";
    return { status, checks, audit };
  }
}

export class SystemHealthModule {
  readonly service: SystemHealthService;

  constructor(prisma: PrismaService, redis: RedisClientPort, queue: QueuePort) {
    this.service = new SystemHealthService(prisma, redis, queue);
  }
}
