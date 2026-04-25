import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { ConsentService } from "../consent/consent.module";

export class LeadTransmissionConsentPolicy {
  constructor(private readonly consent: ConsentService, private readonly audit: AuditLogWriter) {}

  assertValid(actor: ActorContext, input: { consentRecordId?: string; countryId: string; productId: string; targetId: string }): void {
    if (!this.consent.hasValidConsent(input.consentRecordId, "lead_transmission", input.countryId, input.productId)) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.consentLeadTransmissionRefused,
        targetType: "QuoteRequest",
        targetId: input.targetId,
        scope: { countryId: input.countryId, productId: input.productId },
        result: "refused",
        reason: "missing_valid_consent",
        context: {}
      });
      throw new Error("Consent required before transmission");
    }
  }
}
