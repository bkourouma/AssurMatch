import { Queue } from "bullmq";
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
  readonly mode: "memory-test" | "bullmq";
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

export class BullMqQueuePort implements QueuePort {
  readonly mode = "bullmq" as const;
  private readonly jobs: QueueJobRecord[] = [];

  constructor(private readonly queues: Record<string, Queue>) {}

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
    const queue = this.queues[queueName] ?? this.queues.notifications;
    void queue?.add(jobType, { payloadReference, correlationId, queueJobRecordId: job.id }, { jobId: job.id }).catch(() => undefined);
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

export class QueuesModule {
  readonly runtimeMode: "memory-test" | "bullmq";
  readonly notifications: QueuePort;
  readonly futureIa: QueuePort;
  readonly futureRouting: QueuePort;
  readonly maintenance: QueuePort;
  readonly bullQueues?: {
    notifications: Queue;
    futureIa: Queue;
    futureRouting: Queue;
    maintenance: Queue;
  };

  constructor() {
    validateRuntimeEnvironment();
    const redisUrl = process.env.REDIS_URL;
    const useBullMq = !isTestEnvironment() && redisUrl && process.env.ASSURMATCH_QUEUE_MEMORY !== "true";
    this.runtimeMode = useBullMq ? "bullmq" : "memory-test";
    if (useBullMq && redisUrl) {
      const connection = { url: redisUrl };
      this.bullQueues = {
        notifications: new Queue("assurmatch.notifications", { connection }),
        futureIa: new Queue("assurmatch.future-ia", { connection }),
        futureRouting: new Queue("assurmatch.future-routing", { connection }),
        maintenance: new Queue("assurmatch.maintenance", { connection })
      };
      this.notifications = new BullMqQueuePort({ notifications: this.bullQueues.notifications });
      this.futureIa = new BullMqQueuePort({ notifications: this.bullQueues.futureIa, "ai-quote-summary": this.bullQueues.futureIa });
      this.futureRouting = new BullMqQueuePort({ notifications: this.bullQueues.futureRouting });
      this.maintenance = new BullMqQueuePort({ notifications: this.bullQueues.maintenance });
    } else {
      this.notifications = new InMemoryQueue();
      this.futureIa = new InMemoryQueue();
      this.futureRouting = new InMemoryQueue();
      this.maintenance = new InMemoryQueue();
    }
  }

  async close(): Promise<void> {
    if (!this.bullQueues) return;
    await Promise.all(Object.values(this.bullQueues).map((queue) => queue.close()));
  }
}
