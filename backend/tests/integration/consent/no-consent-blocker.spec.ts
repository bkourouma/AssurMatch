import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("no-consent repository blocker", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("does not persist quote transmission side effects when public consent is refused", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = seedPublicRuntime(harness.runtime);
    const response = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Visitor", email: "visitor@example.com", phone: "+2250102030405" },
        answers: { vehicle_use: "prive" },
        consent: {
          accepted: false,
          consentTextId: seed.consentText.id,
          version: "v1",
          contentHash: "runtime-consent-hash"
        },
        ipAddress: "203.0.113.11",
        sessionId: "no-consent-session"
      })
    });

    expect([400, 422]).toContain(response.status);
    expect(harness.runtime.leads.assignments.list()).toHaveLength(0);
    expect(harness.runtime.notifications.service.list()).toHaveLength(0);
    expect(harness.runtime.quoteRequests.submissions.list()).toHaveLength(0);
  });
});
