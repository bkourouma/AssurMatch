import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "./runtime-http-test-utils";

const WIDE_FROM = new Date("2000-01-01T00:00:00.000Z");
const WIDE_TO = new Date("2100-01-01T00:00:00.000Z");

describe("POST /public-stats/visits (spec 073)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    delete process.env.ASSURMATCH_VISIT_COUNTER_ENABLED;
    await harness?.close();
    harness = undefined;
  });

  function post(body: unknown, headers: Record<string, string> = {}) {
    return harness!.request("/public-stats/visits", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
  }

  it("answers 204 without any cookie and counts the page view", async () => {
    harness = await createRuntimeHttpHarness();
    const response = await post({ page: "offers" }, { "user-agent": "secret-agent/1.0", "x-forwarded-for": "203.0.113.9", cookie: "sid=abc" });
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
    const totals = await harness.runtime.visitStats.service.totalsBetween(WIDE_FROM, WIDE_TO);
    expect(totals.total).toBe(1);
    expect(totals.byPage.find((entry) => entry.page === "offers")?.total).toBe(1);
  });

  it("refuses an unknown key, an extra property and a missing body with 400 and counts nothing", async () => {
    harness = await createRuntimeHttpHarness();
    expect((await post({ page: "/pays/CI" })).status).toBe(400);
    expect((await post({ page: "home", url: "https://example.org/?token=x" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await harness.runtime.visitStats.service.totalsBetween(WIDE_FROM, WIDE_TO)).total).toBe(0);
  });

  it("stores only a day, a page key and a count, never anything about the visitor", async () => {
    harness = await createRuntimeHttpHarness();
    await post({ page: "home" }, { "user-agent": "secret-agent/1.0", "x-forwarded-for": "203.0.113.9", referer: "https://example.org/private" });
    const rows = await harness.runtime.visitStats.repository!.listBetween(WIDE_FROM, WIDE_TO);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["count", "day", "page"]);
    const serialized = JSON.stringify(rows);
    for (const forbidden of ["secret-agent", "203.0.113.9", "example.org"]) expect(serialized).not.toContain(forbidden);
  });

  it("answers 204 and counts nothing when ASSURMATCH_VISIT_COUNTER_ENABLED=false", async () => {
    process.env.ASSURMATCH_VISIT_COUNTER_ENABLED = "false";
    harness = await createRuntimeHttpHarness();
    expect((await post({ page: "home" })).status).toBe(204);
    expect((await harness.runtime.visitStats.service.totalsBetween(WIDE_FROM, WIDE_TO)).total).toBe(0);
  });
});
