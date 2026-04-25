import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { ConsentService } from "./consent.module";

export class ConsentTransmissionGuardService {
  constructor(private readonly consent: ConsentService, private readonly audit: AuditLogWriter) {}

  assertTransmissionAllowed(actor: ActorContext, input: { consentRecordId?: string; countryId: string; productId?: string; targetId: string }): void {
    if (!this.consent.hasValidConsent(input.consentRecordId, "lead_transmission", input.countryId, input.productId)) {
      this.audit.write({
        actor,
        action: "lead_transmission.refused",
        targetType: "FutureLead",
        targetId: input.targetId,
        scope: { countryId: input.countryId, productId: input.productId },
        result: "refused",
        reason: "missing valid ConsentRecord",
        context: {}
      });
      throw new Error("Consent required before transmission");
    }
  }
}
