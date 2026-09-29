import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("satisfaction surveys runtime HTTP (spec 048)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("answers neutral unavailable for GET and 404 for POST when survey is unknown or token is wrong", async () => {
    harness = await createRuntimeHttpHarness();

    const getRes = await harness.request("/satisfaction-surveys/SF-UNKNOWN?token=wrong-token");
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as Record<string, unknown>;
    expect(getBody.status).toBe("unavailable");

    const postRes = await harness.request("/satisfaction-surveys/SF-UNKNOWN?token=wrong-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5 })
    });
    expect(postRes.status).toBe(404);
  });

  it("handles valid survey get and submission with idempotence and low score alert", async () => {
    harness = await createRuntimeHttpHarness();

    const tokenService = harness.runtime.satisfactionSurveys.tokenService;
    const repository = harness.runtime.satisfactionSurveys.repository;
    const token = tokenService.generateToken();
    const tokenHash = tokenService.hashToken(token);
    const publicReference = "SF-TST0001";

    await repository.create({
      publicReference,
      tokenHash,
      leadAssignmentId: "assign-1",
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-1",
      triggerStatus: "gagne",
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      dueAt: new Date(),
      flaggedConcern: false,
      locale: "fr"
    });

    // 1. GET valid survey
    const getRes = await harness.request(`/satisfaction-surveys/${publicReference}?token=${token}`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as Record<string, unknown>;
    expect(getBody.status).toBe("available");

    // 2. POST submission with rating 2 and flaggedConcern (triggers compliance alert)
    const postRes = await harness.request(`/satisfaction-surveys/${publicReference}?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 2, comment: "Service decevant", flaggedConcern: true })
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json() as Record<string, unknown>;
    expect(postBody.status).toBe("submitted");
    expect(postBody.alreadySubmitted).toBeUndefined();

    // 3. POST submission again (idempotent)
    const secondPost = await harness.request(`/satisfaction-surveys/${publicReference}?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 2 })
    });
    expect(secondPost.status).toBe(200);
    const secondBody = await secondPost.json() as Record<string, unknown>;
    expect(secondBody.status).toBe("submitted");
    expect(secondBody.alreadySubmitted).toBe(true);

    // 4. Verify survey state in repo
    const survey = await repository.findByPublicReference(publicReference);
    expect(survey?.status).toBe("submitted");
    expect(survey?.rating).toBe(2);
    expect(survey?.flaggedConcern).toBe(true);
  });
});
