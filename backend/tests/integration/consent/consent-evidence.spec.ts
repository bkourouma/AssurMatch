import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("consent evidence", () => {
  it("publishes consent text and stores ConsentRecord evidence", () => {
    const audit = new AuditLogWriter();
    const consent = new ConsentService(audit);
    const text = consent.createText({
      purpose: "lead_transmission",
      countryId: "00000000-0000-4000-8000-000000000030",
      channel: "public_web",
      recipientCategory: "partner_broker",
      language: "fr",
      version: "1",
      status: "review",
      contentHash: "hash-v1"
    }, superAdminActor);
    consent.publishText(text.id, superAdminActor);
    const record = consent.record({
      consentTextId: text.id,
      subjectReference: "subject-1",
      purpose: "lead_transmission",
      countryId: text.countryId,
      channel: "public_web",
      intendedRecipient: "partner_broker",
      grantedAt: new Date().toISOString()
    }, superAdminActor);

    expect(consent.hasValidConsent(record.id, "lead_transmission", text.countryId)).toBe(true);
    expect(audit.all().map((entry) => entry.action)).toContain("consent_record.created");
  });
});
