import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

interface WithdrawalBody {
  status: string;
  publicReference: string;
  alreadyWithdrawn: boolean;
}

describe("visitor consent withdrawal runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function submitQuote(active: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>) {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.60" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Visitor", email: "retrait@example.com", phone: "+2250102030405" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: "runtime-consent-hash" },
        ipAddress: "203.0.113.60",
        sessionId: "runtime-session-withdrawal"
      })
    });
    expect(response.status).toBe(201);
    return await response.json() as { publicReference: string; verificationToken: string };
  }

  it("cancels the request on the first call and stays idempotent afterwards", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const confirmation = await submitQuote(harness, seed);
    const path = `/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`;

    const first = await harness.request(path, { method: "POST", headers: { "x-forwarded-for": "203.0.113.61" } });
    expect(first.status).toBe(200);
    const firstBody = await first.json() as WithdrawalBody;
    expect(firstBody).toMatchObject({ status: "cancelled", publicReference: confirmation.publicReference, alreadyWithdrawn: false });

    const second = await harness.request(path, { method: "POST", headers: { "x-forwarded-for": "203.0.113.61" } });
    expect(second.status).toBe(200);
    const secondBody = await second.json() as WithdrawalBody;
    expect(secondBody).toMatchObject({ status: "cancelled", publicReference: confirmation.publicReference, alreadyWithdrawn: true });

    const quotes = await harness.runtime.quoteRequests.submissions.list();
    expect(quotes.map((quote) => quote.status)).toEqual(["cancelled"]);
    expect(harness.runtime.audit.writer.search({ action: "consent.withdrawn_by_visitor" })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: "quote_request.cancelled_by_visitor" })).toHaveLength(1);
  });

  it("answers 404 for a wrong token and leaves the request untouched", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const confirmation = await submitQuote(harness, seed);

    const response = await harness.request(`/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=wrong-token`, {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.62" }
    });

    expect(response.status).toBe(404);
    const quotes = await harness.runtime.quoteRequests.submissions.list();
    expect(quotes.every((quote) => quote.status !== "cancelled")).toBe(true);
    expect(harness.runtime.audit.writer.search({ action: "consent.withdrawn_by_visitor" })).toHaveLength(0);
  });

  it("answers 404 for an unknown public reference without revealing it", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const response = await harness.request("/quote-requests/QR-2026-UNKNOWN/consent-withdrawal?token=whatever", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.63" }
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ message: "Quote status not available" });
  });
});
