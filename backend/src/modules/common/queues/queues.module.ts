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

export class InMemoryQueue {
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
}

export class QueuesModule {
  readonly notifications = new InMemoryQueue();
  readonly futureIa = new InMemoryQueue();
  readonly futureRouting = new InMemoryQueue();
  readonly maintenance = new InMemoryQueue();
}
