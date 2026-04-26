import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../integration/runtime-http-test-utils";

describe("runtime API contract smoke", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("keeps documented public routes callable through HTTP", async () => {
    harness = await createRuntimeHttpHarness();

    const countries = await harness.request("/countries");
    expect(countries.status).toBe(200);

    const quoteRequest = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect([400, 422]).toContain(quoteRequest.status);
  });
});
