import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import {
  MemorySatisfactionSurveyRepository,
  SatisfactionSurveysService,
  SatisfactionSurveyTokenService
} from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.module";

function createService() {
  const repository = new MemorySatisfactionSurveyRepository();
  const tokenService = new SatisfactionSurveyTokenService();
  const audit = new AuditLogWriter();
  const alerts: Record<string, unknown>[] = [];
  const complianceAlerts = {
    raise: async (alert: Record<string, unknown>) => {
      alerts.push(alert);
    }
  };
  const service = new SatisfactionSurveysService({
    repository,
    tokenService,
    audit,
    complianceAlerts
  });
  return { repository, tokenService, audit, alerts, service };
}

describe("SatisfactionSurveysService", () => {
  it("authenticates valid link and returns available status", async () => {
    const { repository, tokenService, service } = createService();
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
      status: "sent",
      dueAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      flaggedConcern: false,
      locale: "fr"
    });

    const status = await service.checkStatus(publicReference, token);
    expect(status.status).toBe("available");
    expect(status.publicReference).toBe(publicReference);
    expect(status.partnerTenantId).toBe("partner-1");
  });

  it("returns generic unavailable for unknown reference, wrong token, expired link, or already submitted (D4)", async () => {
    const { repository, tokenService, service } = createService();
    const token = tokenService.generateToken();
    const publicReference = tokenService.generatePublicReference();

    // 1. Unknown reference
    const r1 = await service.checkStatus("SF-UNKNOWN", token);
    expect(r1.status).toBe("unavailable");

    // 2. Wrong token
    await repository.create({
      publicReference,
      tokenHash: tokenService.hashToken(token),
      leadAssignmentId: "lead-1",
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-1",
      triggerStatus: "gagne",
      status: "sent",
      dueAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
      flaggedConcern: false,
      locale: "fr"
    });
    const r2 = await service.checkStatus(publicReference, "wrong-token");
    expect(r2.status).toBe("unavailable");

    // 3. Expired link
    const expiredRef = tokenService.generatePublicReference();
    await repository.create({
      publicReference: expiredRef,
      tokenHash: tokenService.hashToken(token),
      leadAssignmentId: "lead-2",
      quoteRequestId: "quote-2",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-2",
      triggerStatus: "gagne",
      status: "sent",
      dueAt: new Date(Date.now() - 40 * 86400_000),
      expiresAt: new Date(Date.now() - 10 * 86400_000),
      flaggedConcern: false,
      locale: "fr"
    });
    const r3 = await service.checkStatus(expiredRef, token);
    expect(r3.status).toBe("unavailable");

    // 4. Already submitted
    const subRef = tokenService.generatePublicReference();
    await repository.create({
      publicReference: subRef,
      tokenHash: tokenService.hashToken(token),
      leadAssignmentId: "lead-3",
      quoteRequestId: "quote-3",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-3",
      triggerStatus: "gagne",
      status: "submitted",
      dueAt: new Date(),
      submittedAt: new Date(),
      rating: 5,
      flaggedConcern: false,
      locale: "fr"
    });
    const r4 = await service.checkStatus(subRef, token);
    expect(r4.status).toBe("unavailable");

    // All return identical message
    expect(r1.message).toBe(r2.message);
    expect(r2.message).toBe(r3.message);
    expect(r3.message).toBe(r4.message);
  });

  it("submits satisfaction response, stores rating and escaped comment, raises alert on low rating (D6, D7)", async () => {
    const { repository, tokenService, alerts, audit, service } = createService();
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
      status: "sent",
      dueAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
      flaggedConcern: false,
      locale: "fr"
    });

    const result = await service.submit(publicReference, token, {
      rating: 2,
      comment: "Courtier en retard <script>alert(1)</script>",
      flaggedConcern: true
    });

    expect(result.status).toBe("submitted");
    expect(result.publicReference).toBe(publicReference);

    const stored = await repository.findByPublicReference(publicReference);
    expect(stored?.status).toBe("submitted");
    expect(stored?.rating).toBe(2);
    expect(stored?.flaggedConcern).toBe(true);
    expect(stored?.comment).toBe("Courtier en retard <script>alert(1)</script>");

    // Alert was raised with rating and flag, but NEVER comment inline
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual({
      partnerTenantId: "partner-1",
      publicReference,
      rating: 2,
      flaggedConcern: true
    });
    expect(alerts[0]!.comment).toBeUndefined();

    // Check audit logs
    const submittedAudit = audit.search({ action: "satisfaction_survey.submitted" });
    expect(submittedAudit).toHaveLength(1);
    expect(submittedAudit[0]!.context.rating).toBe(2);
    expect(submittedAudit[0]!.context.comment).toBeUndefined(); // comment excluded from context
  });

  it("is immutable: second submission returns prior confirmation and mutates nothing (D8)", async () => {
    const { repository, tokenService, service } = createService();
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
      status: "sent",
      dueAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
      flaggedConcern: false,
      locale: "fr"
    });

    const first = await service.submit(publicReference, token, { rating: 5, comment: "Parfait" });
    expect(first.status).toBe("submitted");

    // Second submission with different rating
    const second = await service.submit(publicReference, token, { rating: 1, comment: "Changement davis" });
    expect(second.status).toBe("submitted");
    expect(second.alreadySubmitted).toBe(true);

    const stored = await repository.findByPublicReference(publicReference);
    expect(stored?.rating).toBe(5);
    expect(stored?.comment).toBe("Parfait");
  });

  it("escapes HTML on listPartnerResponses and enforces cross-tenant RBAC", async () => {
    const { repository, tokenService, service } = createService();
    const token = tokenService.generateToken();
    const ref = tokenService.generatePublicReference();
    await repository.create({
      publicReference: ref,
      tokenHash: tokenService.hashToken(token),
      leadAssignmentId: "lead-1",
      quoteRequestId: "quote-1",
      partnerTenantId: "partner-1",
      consentRecordId: "consent-1",
      triggerStatus: "gagne",
      status: "sent",
      dueAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
      flaggedConcern: false,
      locale: "fr"
    });

    await service.submit(ref, token, { rating: 4, comment: "Tres bien <b>bravo</b>" });

    // Partner 1 reads its own
    const partner1Actor = { actorId: "u1", roles: ["broker_owner_pro"] as AssurMatchRole[], partnerTenantId: "partner-1" };
    const list1 = await service.listPartnerResponses("partner-1", partner1Actor);
    expect(list1).toHaveLength(1);
    expect(list1[0]!.comment).toBe("Tres bien &lt;b&gt;bravo&lt;/b&gt;");

    // Partner 2 attempts to read partner 1 -> forbidden
    const partner2Actor = { actorId: "u2", roles: ["broker_owner_pro"] as AssurMatchRole[], partnerTenantId: "partner-2" };
    await expect(service.listPartnerResponses("partner-1", partner2Actor)).rejects.toThrow("Cross-tenant access refused");

    // Super admin can read partner 1
    const adminActor = { actorId: "a1", roles: ["super_admin"] as AssurMatchRole[] };
    const adminList = await service.listPartnerResponses("partner-1", adminActor);
    expect(adminList).toHaveLength(1);
  });
});
