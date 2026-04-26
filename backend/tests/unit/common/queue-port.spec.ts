import { describe, expect, it } from "vitest";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";

describe("QueuePort memory-test adapter", () => {
  it("records queue jobs with observable status transitions", () => {
    const queue = new InMemoryQueue();
    const job = queue.add("visitor-quote-notifications", "visitor_quote_notification", "quote-1", "corr-1");

    expect(queue.mode).toBe("memory-test");
    expect(job.payloadReference).toBe("quote-1");
    expect(queue.transition(job.id, "completed").status).toBe("completed");
    expect(queue.health()).toBe("ok");
  });
});
