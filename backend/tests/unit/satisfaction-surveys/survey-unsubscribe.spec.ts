import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import {
  MemoryNotificationUnsubscribeRepository,
  MemorySatisfactionSurveyRepository,
  SATISFACTION_SURVEY_PURPOSE,
  SatisfactionSurveyEmailTemplateService,
  SatisfactionSurveysDrainService,
  SurveyUnsubscribeService,
  UnsubscribeTokenInvalidError,
  UnsubscribeTokenSigner,
  unsubscribeSubjectHash
} from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.module";

const EMAIL = "Client@Example.com";

function harness(language: "fr" | "en" = "fr") {
  const audit = new AuditLogWriter();
  const unsubscribe = new SurveyUnsubscribeService(new MemoryNotificationUnsubscribeRepository(), audit);
  const repository = new MemorySatisfactionSurveyRepository();
  const sent: AuthEmailPayload[] = [];
  const drain = new SatisfactionSurveysDrainService({
    repository,
    audit,
    emailTemplate: new SatisfactionSurveyEmailTemplateService(),
    emailDelivery: { sendAuthEmail: async (payload) => { sent.push(payload); return { status: "sent" }; } },
    quotes: {
      findById: async (id: string) => ({
        id, publicReference: "QR-1", countryId: "country-1", productId: "product-1", prospectId: "prospect-1", surveyConsentRecordId: "consent-survey", language
      }) as never
    },
    prospects: { find: async () => ({ id: "prospect-1", emailNormalized: EMAIL.toLowerCase() }) as never },
    consent: { hasValidConsent: async () => true },
    countries: { findById: async () => ({ id: "country-1", status: "public", flags: { country_public_enabled: true } }) },
    products: { findById: async () => ({ id: "product-1", status: "public", flags: { product_public_enabled: true } }) },
    isFlagEnabled: () => true,
    unsubscribe
  });
  const queue = (reference: string, leadAssignmentId: string) => repository.create({
    publicReference: reference,
    tokenHash: "hash",
    leadAssignmentId,
    quoteRequestId: "quote-1",
    partnerTenantId: "partner-1",
    consentRecordId: "consent-survey",
    triggerStatus: "gagne",
    status: "queued",
    dueAt: new Date(Date.now() - 3600_000),
    flaggedConcern: false,
    locale: language
  });
  return { audit, unsubscribe, repository, drain, sent, queue };
}

function tokenFrom(body: string, path: string): string {
  const match = new RegExp(`${path}\\?token=([^\\s]+)`).exec(body);
  if (!match?.[1]) throw new Error("no unsubscribe link");
  return decodeURIComponent(match[1]);
}

describe("spec 061 satisfaction survey unsubscribe", () => {
  it("signs a token that carries the hashed address only and rejects any forgery", () => {
    const signer = new UnsubscribeTokenSigner({ NODE_ENV: "test" });
    const token = signer.sign(EMAIL, SATISFACTION_SURVEY_PURPOSE, "fr");
    expect(token).not.toContain("example");
    expect(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")).not.toContain("@");
    expect(signer.verify(token)).toMatchObject({ p: SATISFACTION_SURVEY_PURPOSE, s: unsubscribeSubjectHash("client@example.com"), l: "fr" });
    const [body, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ v: 1, p: SATISFACTION_SURVEY_PURPOSE, s: unsubscribeSubjectHash("other@example.com"), l: "fr" })).toString("base64url");
    expect(signer.verify(`${forgedBody}.${signature}`)).toBeUndefined();
    expect(signer.verify(`${body}.${signature!.slice(0, -2)}xx`)).toBeUndefined();
    expect(new UnsubscribeTokenSigner({ ASSURMATCH_UNSUBSCRIBE_SECRET: "another-secret-of-at-least-32-characters!!" }).verify(token)).toBeUndefined();
    expect(() => new UnsubscribeTokenSigner({ NODE_ENV: "production" }).sign(EMAIL, SATISFACTION_SURVEY_PURPOSE, "fr")).toThrow(/not configured/);
  });

  it("adds the opt-out link to the FR and EN e-mails, then stops sending after the visitor confirms", async () => {
    const fr = harness("fr");
    await fr.queue("SF-UNSUB01", "lead-1");
    await fr.drain.deliverDue();
    expect(fr.sent).toHaveLength(1);
    expect(fr.sent[0]!.body).toContain("Ne plus recevoir d'enquêtes de satisfaction");
    const token = tokenFrom(fr.sent[0]!.body, "/desinscription");

    await expect(fr.unsubscribe.unsubscribe({ token: `${token}x` })).rejects.toBeInstanceOf(UnsubscribeTokenInvalidError);
    await expect(fr.unsubscribe.unsubscribe({ token: "garbage" })).rejects.toBeInstanceOf(UnsubscribeTokenInvalidError);
    expect(await fr.unsubscribe.unsubscribe({ token })).toEqual({ status: "unsubscribed", locale: "fr" });
    // Idempotent: a second click is not an error.
    expect(await fr.unsubscribe.unsubscribe({ token })).toEqual({ status: "unsubscribed", locale: "fr" });
    expect(await fr.unsubscribe.isUnsubscribed("CLIENT@example.com")).toBe(true);

    await fr.queue("SF-UNSUB02", "lead-2");
    const summary = await fr.drain.deliverDue();
    expect(summary).toMatchObject({ sent: 0, skipped: 1 });
    expect(fr.sent).toHaveLength(1);
    expect((await fr.repository.findByPublicReference("SF-UNSUB02"))?.skippedReason).toBe("visitor_unsubscribed");
    const audits = fr.audit.all().filter((entry) => entry.action === "notification.unsubscribed");
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain("example.com");

    const en = harness("en");
    await en.queue("SF-UNSUB03", "lead-3");
    await en.drain.deliverDue();
    expect(en.sent[0]!.body).toContain("To stop receiving satisfaction surveys");
    expect(tokenFrom(en.sent[0]!.body, "/en/unsubscribe")).toContain(".");
  });
});
