import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("public quote runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("accepts consented quote requests and refuses missing consent", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const payload = {
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: "Visitor", email: "visitor@example.com", phone: "+2250102030405" },
      answers: { vehicle_use: "prive" },
      consent: {
        accepted: true,
        consentTextId: seed.consentText.id,
        version: "v1",
        contentHash: "runtime-consent-hash"
      },
      ipAddress: "203.0.113.10",
      sessionId: "runtime-session-1"
    };

    const accepted = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(accepted.status).toBe(201);
    expect(await harness.runtime.quoteRequests.submissions.list()).toHaveLength(1);
    expect(await harness.runtime.prospects.service.list()).toHaveLength(1);
    expect(await harness.runtime.consent.service.searchRecords(seed.admin)).toHaveLength(1);

    const refused = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, sessionId: "runtime-session-2", consent: { ...payload.consent, accepted: false } })
    });
    expect([400, 422]).toContain(refused.status);
  });
});
