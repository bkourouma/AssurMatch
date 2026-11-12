import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { toSafeErrorResponse } from "../../../src/modules/common/filters/error-response.filter";
import {
  MemorySatisfactionSurveyRepository,
  SatisfactionSurveysService,
  SatisfactionSurveyTokenService
} from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.module";
import { SATISFACTION_SURVEY_RESPONSE_SCOPE } from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.service";

async function setup(overrides: { status?: "sent" | "skipped" | "expired"; expiresAt?: Date; abuseGuard?: { assertAllowed: (input: { scope: string }) => Promise<void> } } = {}) {
  const repository = new MemorySatisfactionSurveyRepository();
  const tokenService = new SatisfactionSurveyTokenService();
  const service = new SatisfactionSurveysService({
    repository,
    tokenService,
    audit: new AuditLogWriter(),
    complianceAlerts: { raise: async () => {} },
    ...(overrides.abuseGuard ? { abuseGuard: overrides.abuseGuard as never } : {})
  });
  const token = tokenService.generateToken();
  const publicReference = tokenService.generatePublicReference();
  await repository.create({
    publicReference,
    tokenHash: tokenService.hashToken(token),
    leadAssignmentId: "lead-1",
    quoteRequestId: "quote-1",
    partnerTenantId: "partner-1",
    consentRecordId: "consent-1",
    triggerStatus: "gagne",
    status: overrides.status ?? "sent",
    dueAt: new Date(Date.now() - 3600_000),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 86400_000),
    flaggedConcern: false,
    locale: "fr"
  });
  return { service, token, publicReference };
}

async function caught(promise: Promise<unknown>): Promise<HttpException> {
  const error = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

describe("satisfaction survey submission errors (A-07a)", () => {
  it("answers 400 VALIDATION_FAILED naming `rating` for a missing or invalid rating", async () => {
    const { service, token, publicReference } = await setup();
    for (const input of [{}, { rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: "3" }, undefined]) {
      const error = await caught(service.submit(publicReference, token, input as never));
      expect(error.getStatus()).toBe(400);
      const body = toSafeErrorResponse(error, "c1", error.getStatus());
      expect(body.code).toBe("VALIDATION_FAILED");
      expect(body.message).toContain("rating");
    }
  });

  it("answers the same neutral 404 for a forged token, unknown reference, missing token, expired and skipped surveys", async () => {
    const forged = await setup();
    const expired = await setup({ expiresAt: new Date(Date.now() - 1000) });
    const skipped = await setup({ status: "skipped" });
    const calls = [
      () => forged.service.submit(forged.publicReference, `${forged.token.slice(0, -4)}AAAA`, { rating: 3 }),
      () => forged.service.submit("SF-UNKNOWN", forged.token, { rating: 3 }),
      () => forged.service.submit(forged.publicReference, undefined, { rating: 3 }),
      () => expired.service.submit(expired.publicReference, expired.token, { rating: 3 }),
      () => skipped.service.submit(skipped.publicReference, skipped.token, { rating: 3 })
    ];
    const bodies: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      const error = await caught(call());
      expect(error.getStatus()).toBe(404);
      const { code, message } = toSafeErrorResponse(error, "c1", error.getStatus());
      bodies.push({ code, message });
    }
    expect(bodies[0]).toEqual({ code: "NOT_FOUND", message: "Survey link not found" });
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it("still returns the prior confirmation for an already submitted survey (idempotent, D8)", async () => {
    const { service, token, publicReference } = await setup();
    expect((await service.submit(publicReference, token, { rating: 4 })).status).toBe("submitted");
    expect(await service.submit(publicReference, token, { rating: 1 })).toMatchObject({ status: "submitted", alreadySubmitted: true });
  });

  it("uses its own per-IP counter, not the shared consent_withdrawal one", async () => {
    const scopes: string[] = [];
    const { service, token, publicReference } = await setup({ abuseGuard: { assertAllowed: async (input) => { scopes.push(input.scope); } } });
    await service.submit(publicReference, token, { rating: 5 }, "203.0.113.9");
    expect(scopes).toEqual([SATISFACTION_SURVEY_RESPONSE_SCOPE]);
    expect(SATISFACTION_SURVEY_RESPONSE_SCOPE).toBe("satisfaction_survey_response");
  });
});
