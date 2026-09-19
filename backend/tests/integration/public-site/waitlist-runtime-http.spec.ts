import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeHttpHarness,
  seedPublicRuntime,
  seedWaitlistCountry,
  type RuntimeHttpHarness
} from "../runtime-http-test-utils";

interface WaitlistBody {
  countryCode: string;
  email: string;
  consent: true;
  website?: string;
  sessionId?: string;
  productKey?: string;
}

/** Each case uses its own forwarded IP so the five-per-window counter never leaks between tests. */
function post(harness: RuntimeHttpHarness, body: WaitlistBody, ipAddress: string): Promise<Response> {
  return harness.request("/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ipAddress },
    body: JSON.stringify(body)
  });
}

describe("public waitlist runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("accepts a subscription for a waitlist-only country and audits it", async () => {
    harness = await createRuntimeHttpHarness();
    await seedWaitlistCountry(harness.runtime);

    const response = await post(harness, { countryCode: "SN", email: "visiteur@example.com", consent: true }, "203.0.113.20");

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ status: "accepted", countryCode: "SN" });
    expect(harness.runtime.audit.writer.search({ action: "waitlist.subscribed" })).toHaveLength(1);
  });

  it("answers the same payload for a duplicate address without creating a second entry", async () => {
    harness = await createRuntimeHttpHarness();
    await seedWaitlistCountry(harness.runtime);
    const body: WaitlistBody = { countryCode: "SN", email: "duplique@example.com", consent: true };

    const first = await post(harness, body, "203.0.113.21");
    const second = await post(harness, body, "203.0.113.21");

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await second.json()).toEqual(await first.json());
    expect(harness.runtime.audit.writer.search({ action: "waitlist.subscribed" })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: "waitlist.duplicate_ignored" })).toHaveLength(1);
  });

  it("refuses a country that is already open to the public", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const response = await post(harness, { countryCode: "CI", email: "trop.tard@example.com", consent: true }, "203.0.113.22");

    expect(response.status).toBe(422);
    const refusals = harness.runtime.audit.writer.search({ action: "waitlist.refused" });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toBe("waitlist_disabled");
    expect(harness.runtime.audit.writer.search({ action: "waitlist.subscribed" })).toHaveLength(0);
  });

  it("refuses a filled honeypot before any entry is written", async () => {
    harness = await createRuntimeHttpHarness();
    await seedWaitlistCountry(harness.runtime);

    const response = await post(
      harness,
      { countryCode: "SN", email: "bot@example.com", consent: true, website: "http://spam.example" },
      "203.0.113.23"
    );

    expect(response.status).toBe(400);
    expect(harness.runtime.audit.writer.search({ action: "waitlist.subscribed" })).toHaveLength(0);
  });

  it("rate limits a single IP past five submissions in the window", async () => {
    harness = await createRuntimeHttpHarness();
    await seedWaitlistCountry(harness.runtime);

    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await post(harness, { countryCode: "SN", email: `flood${index}@example.com`, consent: true }, "203.0.113.24");
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(statuses[5]).toBe(429);
    expect(harness.runtime.audit.writer.search({ action: "waitlist.subscribed" })).toHaveLength(5);
  });
});
