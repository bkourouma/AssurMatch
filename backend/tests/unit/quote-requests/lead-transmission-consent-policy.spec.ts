import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import { LeadTransmissionConsentPolicy } from "../../../src/modules/quote-requests/lead-transmission-consent-policy";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("LeadTransmissionConsentPolicy", () => {
  it("blocks missing consent and allows valid lead-transmission consent", async () => {
    const audit = new AuditLogWriter();
    const consent = new ConsentService(audit);
    const policy = new LeadTransmissionConsentPolicy(consent, audit);
    const countryId = crypto.randomUUID();
    const productId = crypto.randomUUID();

    await expect(policy.assertValid(superAdminActor, { countryId, productId, targetId: "quote" })).rejects.toThrow("Consent required before transmission");

    const record = await consent.record({
      consentTextId: crypto.randomUUID(),
      subjectReference: "fingerprint",
      purpose: "lead_transmission",
      countryId,
      productId,
      channel: "public_web",
      intendedRecipient: "courtier_partenaire_eligible",
      status: "granted",
      grantedAt: "2026-04-25T00:00:00.000Z"
    }, superAdminActor);

    await expect(policy.assertValid(superAdminActor, { consentRecordId: record.id, countryId, productId, targetId: "quote" })).resolves.toBeUndefined();
  });
});
