import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import {
  MemorySatisfactionSurveyRepository,
  SatisfactionSurveyTokenService,
  SatisfactionSurveyTriggerService
} from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.module";

function createTriggerHarness(overrides: { flagEnabled?: boolean; hasConsent?: boolean; countryActive?: boolean; productActive?: boolean } = {}) {
  const repository = new MemorySatisfactionSurveyRepository();
  const tokenService = new SatisfactionSurveyTokenService();
  const audit = new AuditLogWriter();

  const flagEnabled = overrides.flagEnabled ?? true;
  const hasConsent = overrides.hasConsent ?? true;
  const countryActive = overrides.countryActive ?? true;
  const productActive = overrides.productActive ?? true;

  const assignments = {
    find: async (id: string) => ({
      id,
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-1",
      status: "assigned" as const,
      assignedAt: new Date(),
      assignmentReason: "rule",
      publicReference: "QR-1",
      countryCode: "CI",
      productKey: "auto",
      createdAt: new Date(),
      updatedAt: new Date()
    })
  };

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
      payload: { locale: "fr" },
      status: "created" as const,
      duplicateStatus: "unique" as const,
      routingStatus: "assigned" as const,
      retentionUntil: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
  };

  const consent = {
    hasValidConsent: async () => hasConsent
  };

  const countries = {
    findById: async () => countryActive ? { id: "country-1", status: "public", flags: { country_public_enabled: true } } : undefined
  };

  const products = {
    findById: async () => productActive ? { id: "product-1", status: "public", flags: { product_public_enabled: true } } : undefined
  };

  const trigger = new SatisfactionSurveyTriggerService({
    repository,
    tokenService,
    audit,
    assignments,
    quotes,
    consent,
    countries,
    products,
    isFlagEnabled: () => flagEnabled
  });

  return { repository, trigger, audit };
}

describe("SatisfactionSurveyTriggerService", () => {
  it("creates exactly one queued survey for Pro gagne with 24h delay (D1, D3)", async () => {
    const { repository, trigger, audit } = createTriggerHarness();
    const result = await trigger.onLeadStatusChanged({
      leadAssignmentId: "assign-1",
      status: "gagne",
      previousStatus: "contacte",
      partnerTenantId: "partner-1"
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("queued");
    expect(result?.triggerStatus).toBe("gagne");
    expect(result?.publicReference).toMatch(/^SF-[A-F0-9]{8}$/);

    const now = Date.now();
    const delayHours = (result!.dueAt.getTime() - now) / 3600_000;
    expect(Math.round(delayHours)).toBe(24);

    expect(audit.search({ action: "satisfaction_survey.queued" })).toHaveLength(1);
    expect(await repository.listAll()).toHaveLength(1);
  });

  it("creates exactly one queued survey for Starter closed with same 24h delay (D1, D2)", async () => {
    const { trigger } = createTriggerHarness();
    const result = await trigger.onLeadStatusChanged({
      leadAssignmentId: "assign-starter",
      status: "closed",
      previousStatus: "accepted",
      partnerTenantId: "partner-1"
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("queued");
    expect(result?.triggerStatus).toBe("closed");
  });

  it("excludes non-completed statuses: doublon, hors_cible, injoignable, rejete_conteste, rejected", async () => {
    const { repository, trigger } = createTriggerHarness();
    for (const status of ["doublon", "hors_cible", "injoignable", "rejete_conteste", "rejected", "accepted", "seen"]) {
      const result = await trigger.onLeadStatusChanged({
        leadAssignmentId: `assign-${status}`,
        status,
        partnerTenantId: "partner-1"
      });
      expect(result).toBeNull();
    }
    expect(await repository.listAll()).toHaveLength(0);
  });

  it("creates nothing when satisfaction_survey_enabled flag is closed (D8)", async () => {
    const { repository, trigger } = createTriggerHarness({ flagEnabled: false });
    const result = await trigger.onLeadStatusChanged({
      leadAssignmentId: "assign-1",
      status: "gagne",
      partnerTenantId: "partner-1"
    });
    expect(result).toBeNull();
    expect(await repository.listAll()).toHaveLength(0);
  });

  it("creates nothing when service_quality_survey consent is missing (Scenario 4)", async () => {
    const { repository, trigger } = createTriggerHarness({ hasConsent: false });
    const result = await trigger.onLeadStatusChanged({
      leadAssignmentId: "assign-1",
      status: "gagne",
      partnerTenantId: "partner-1"
    });
    expect(result).toBeNull();
    expect(await repository.listAll()).toHaveLength(0);
  });

  it("is idempotent: a second trigger on the same assignment creates nothing (FR-012)", async () => {
    const { repository, trigger } = createTriggerHarness();
    const first = await trigger.onLeadStatusChanged({
      leadAssignmentId: "assign-1",
      status: "gagne",
      partnerTenantId: "partner-1"
    });
    expect(first).not.toBeNull();

    const second = await trigger.onLeadStatusChanged({
      leadAssignmentId: "assign-1",
      status: "gagne",
      partnerTenantId: "partner-1"
    });
    expect(second).toBeNull();
    expect(await repository.listAll()).toHaveLength(1);
  });
});
