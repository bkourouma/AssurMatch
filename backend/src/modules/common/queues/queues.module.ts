import { isTestEnvironment, validateRuntimeEnvironment } from "../../../config/config.module";

export type QueueJobStatus = "queued" | "active" | "completed" | "failed" | "retryable" | "discarded";

export interface QueueJobRecord {
  id: string;
  queueName: string;
  jobType: string;
  status: QueueJobStatus;
  payloadReference: string;
  retryCount: number;
  failureReason?: string;
  correlationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueuePort {
  readonly mode: "memory-test" | "process-ledger";
  add(queueName: string, jobType: string, payloadReference: string, correlationId?: string): QueueJobRecord;
  transition(id: string, status: QueueJobStatus, failureReason?: string): QueueJobRecord;
  list(): QueueJobRecord[];
  health(): "ok" | "degraded";
}

export class InMemoryQueue implements QueuePort {
  readonly mode = "memory-test" as const;
  private readonly jobs: QueueJobRecord[] = [];

  add(queueName: string, jobType: string, payloadReference: string, correlationId?: string): QueueJobRecord {
    const now = new Date();
    const job: QueueJobRecord = {
      id: crypto.randomUUID(),
      queueName,
      jobType,
      status: "queued",
      payloadReference,
      retryCount: 0,
      ...(correlationId ? { correlationId } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.jobs.push(job);
    return job;
  }

  transition(id: string, status: QueueJobStatus, failureReason?: string): QueueJobRecord {
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error(`Queue job ${id} not found`);
    job.status = status;
    if (failureReason) job.failureReason = failureReason;
    if (status === "retryable") job.retryCount += 1;
    job.updatedAt = new Date();
    return job;
  }

  list(): QueueJobRecord[] {
    return [...this.jobs];
  }

  health(): "ok" | "degraded" {
    return this.jobs.some((job) => job.status === "failed") ? "degraded" : "ok";
  }
}

/**
 * Spec 057 / PRD decision D-7: asynchronous work is driven by database polling in the dedicated
 * worker container (quote notifications, satisfaction surveys, partner webhooks), never by BullMQ.
 *
 * The previous BullMQ port pushed every job to Redis queues that no `Worker` ever consumed, so they
 * grew forever, and kept an unbounded in-process list on top. Callers only use the returned
 * `QueueJobRecord` and `transition()` for in-process traceability, which this ledger keeps, bounded.
 */
export class ProcessJobLedger implements QueuePort {
  readonly mode = "process-ledger" as const;
  private readonly jobs: QueueJobRecord[] = [];

  constructor(private readonly capacity = 1000) {}

  add(queueName: string, jobType: string, payloadReference: string, correlationId?: string): QueueJobRecord {
    const now = new Date();
    const job: QueueJobRecord = {
      id: crypto.randomUUID(),
      queueName,
      jobType,
      status: "queued",
      payloadReference,
      retryCount: 0,
      ...(correlationId ? { correlationId } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.jobs.push(job);
    this.evict();
    return job;
  }

  transition(id: string, status: QueueJobStatus, failureReason?: string): QueueJobRecord {
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error(`Queue job ${id} not found`);
    job.status = status;
    if (failureReason) job.failureReason = failureReason;
    if (status === "retryable") job.retryCount += 1;
    job.updatedAt = new Date();
    return job;
  }

  list(): QueueJobRecord[] {
    return [...this.jobs];
  }

  health(): "ok" | "degraded" {
    return this.jobs.some((job) => job.status === "failed") ? "degraded" : "ok";
  }

  /** Drops finished records first, then the oldest ones, so a running job is the last to go. */
  private evict(): void {
    while (this.jobs.length > this.capacity) {
      const finished = this.jobs.findIndex((job) => job.status === "completed" || job.status === "discarded");
      this.jobs.splice(finished >= 0 ? finished : 0, 1);
    }
  }
}

export class QueuesModule {
  readonly runtimeMode: "memory-test" | "process-ledger";
  readonly notifications: QueuePort;
  readonly futureIa: QueuePort;
  readonly futureRouting: QueuePort;
  readonly maintenance: QueuePort;

  constructor() {
    validateRuntimeEnvironment();
    const useLedger = !isTestEnvironment() && process.env.ASSURMATCH_QUEUE_MEMORY !== "true";
    this.runtimeMode = useLedger ? "process-ledger" : "memory-test";
    const create = (): QueuePort => (useLedger ? new ProcessJobLedger() : new InMemoryQueue());
    this.notifications = create();
    this.futureIa = create();
    this.futureRouting = create();
    this.maintenance = create();
  }

  async close(): Promise<void> {
    return undefined;
  }
}
