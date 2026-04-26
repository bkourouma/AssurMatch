import { describe, expect, it } from "vitest";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";

describe("queue job record transitions", () => {
  it("tracks queued, active and completed states", async () => {
    const queue = new InMemoryQueue();
    const job = queue.add("notifications", "notification", "payload");
    queue.transition(job.id, "active");
    const completed = queue.transition(job.id, "completed");

    expect(completed.status).toBe("completed");
  });
});
