import type { AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import {
  MemorySatisfactionSurveyRepository,
  SatisfactionSurveyEmailTemplateService,
  SatisfactionSurveysDrainService
} from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.module";

function createDrainHarness(overrides: { flagEnabled?: boolean; hasConsent?: boolean } = {}) {
  const repository = new MemorySatisfactionSurveyRepository();
  const audit = new AuditLogWriter();
  const emailTemplate = new SatisfactionSurveyEmailTemplateService();
  const sentEmails: AuthEmailPayload[] = [];
  const emailDelivery = {
    sendAuthEmail: async (payload: AuthEmailPayload) => {
      sentEmails.push(payload);
      return { status: "sent" };
    }
  };

  const flagEnabled = overrides.flagEnabled ?? true;
  const hasConsent = overrides.hasConsent ?? true;

  const quotes = {
    findById: async (id: string) => ({
      id,
      publicReference: "QR-1",
      verificationTokenHash: "hash",
      countryId: "country-1",
      countryCode: "CI",
      productId: "product-1",
      productKey: "auto",
      quoteFormDefinitionId: "form-1",
      prospectId: "prospect-1",
      consentRecordId: "consent-lead",
      surveyConsentRecordId: "consent-survey",
      source: "public_web" as const,
      payload: {},
      status: "created" as const,
      duplicateStatus: "unique" as const,
      routingStatus: "assigned" as const,
      retentionUntil: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
  };

  const prospects = {
    find: async () => ({
      id: "prospect-1",
      countryId: "country-1",
      productId: "product-1",
      emailNormalized: "client@example.com",
      emailFingerprint: "fp-email",
      phoneNormalized: "+2250102030405",
      phoneFingerprint: "fp-phone",
      consentRecordIds: ["consent-survey"],
      retentionUntil: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
  };

  const consent = {
    hasValidConsent: async () => hasConsent
  };

  const countries = {
    findById: async () => ({ id: "country-1", status: "public", flags: { country_public_enabled: true } })
  };

  const products = {
    findById: async () => ({ id: "product-1", status: "public", flags: { product_public_enabled: true } })
  };

  const drain = new SatisfactionSurveysDrainService({
    repository,
    audit,
    emailTemplate,
    emailDelivery,
    quotes,
    prospects,
    consent,
    countries,
    products,
    isFlagEnabled: () => flagEnabled
  });

  return { repository, drain, sentEmails, audit };
}

describe("SatisfactionSurveysDrainService", () => {
  it("delivers due surveys and updates status to sent with 30-day expiration", async () => {
    const { repository, drain, sentEmails } = createDrainHarness();
    const past = new Date(Date.now() - 3600_000);
    await repository.create({
      publicReference: "SF-DUE0001",
      tokenHash: "hash",
      leadAssignmentId: "lead-1",
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-survey",
      triggerStatus: "gagne",
      status: "queued",
      dueAt: past,
      flaggedConcern: false,
      locale: "fr"
    });

    const summary = await drain.deliverDue();
    expect(summary.sent).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe("client@example.com");

    const updated = await repository.findByPublicReference("SF-DUE0001");
    expect(updated?.status).toBe("sent");
    expect(updated?.sentAt).toBeDefined();
    expect(updated?.expiresAt).toBeDefined();

    // Second run: idempotence, already sent
    const secondSummary = await drain.deliverDue();
    expect(secondSummary.sent).toBe(0);
    expect(sentEmails).toHaveLength(1);
  });

  it("skips ineligible survey if consent was withdrawn before drain time", async () => {
    const { repository, drain, sentEmails, audit } = createDrainHarness({ hasConsent: false });
    const past = new Date(Date.now() - 3600_000);
    await repository.create({
      publicReference: "SF-NOCONSENT",
      tokenHash: "hash",
      leadAssignmentId: "lead-2",
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-survey",
      triggerStatus: "gagne",
      status: "queued",
      dueAt: past,
      flaggedConcern: false,
      locale: "fr"
    });

    const summary = await drain.deliverDue();
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(sentEmails).toHaveLength(0);

    const updated = await repository.findByPublicReference("SF-NOCONSENT");
    expect(updated?.status).toBe("skipped");
    expect(updated?.skippedReason).toBe("consent_withdrawn_or_missing");
    expect(audit.search({ action: "satisfaction_survey.skipped" })).toHaveLength(1);
  });
});
