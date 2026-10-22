import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("partner API rate limiting runtime HTTP (spec 075 FR-C1..C3)", () => {
  let harness: RuntimeHttpHarness | undefined;

  beforeEach(() => {
    process.env.ASSURMATCH_PARTNER_API_RATE_LIMIT_KEY_MAX = "2";
    process.env.ASSURMATCH_PARTNER_API_RATE_LIMIT_WINDOW_SECONDS = "60";
  });

  afterEach(async () => {
    delete process.env.ASSURMATCH_PARTNER_API_RATE_LIMIT_KEY_MAX;
    delete process.env.ASSURMATCH_PARTNER_API_RATE_LIMIT_WINDOW_SECONDS;
    await harness?.close();
    harness = undefined;
  });

  it("answers 429 with Retry-After once a key (even an unknown one) exceeds its limit, without touching other keys", async () => {
    harness = await createRuntimeHttpHarness();
    const call = (key: string) => harness!.request("/partner-api/v1/leads", { headers: { Authorization: `Bearer ${key}` } });

    const first = await call("am_pk_unknown_key_1");
    expect(first.status).not.toBe(429);
    expect(first.headers.get("x-ratelimit-limit")).toBe("2");
    expect(first.headers.get("x-ratelimit-remaining")).toBe("1");
    expect((await call("am_pk_unknown_key_1")).status).not.toBe(429);

    const limited = await call("am_pk_unknown_key_1");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await readJson<{ code: string }>(limited)).toMatchObject({ code: "RATE_LIMITED" });

    expect((await call("am_pk_unknown_key_2")).status).not.toBe(429);
  });
});
