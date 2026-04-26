import type { RoutingPrecheckRequestDto } from "../../../../packages/shared/contracts/ops.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { ConsentService } from "../consent/consent.module";
import type { ActorContext } from "../common/types";
import { PartnerEligibilityService } from "../partners/partner-eligibility.service";

export interface RoutingPrecheckResult {
  result: "eligible" | "not_eligible";
  reasons: string[];
  notifiedBrokers: false;
  transmittedLead: false;
}

export class RoutingPrecheckService {
  constructor(
    private readonly consent: ConsentService,
    private readonly partnerEligibility: PartnerEligibilityService,
    private readonly audit: AuditLogWriter
  ) {}

  async evaluate(actor: ActorContext, input: RoutingPrecheckRequestDto): Promise<RoutingPrecheckResult> {
    const reasons: string[] = [];
    if (!await this.consent.hasValidConsent(input.consentRecordId, "lead_transmission", input.countryId, input.productId)) {
      reasons.push("consent_missing_or_out_of_scope");
    }
    const partner = await this.partnerEligibility.evaluate(input.partnerTenantId, input.countryId, input.productId);
    reasons.push(...partner.reasons);
    const result: RoutingPrecheckResult = {
      result: reasons.length === 0 ? "eligible" : "not_eligible",
      reasons,
      notifiedBrokers: false,
      transmittedLead: false
    };
    this.audit.write({
      actor,
      action: "routing_precheck.evaluated",
      targetType: "RoutingPrecheck",
      targetId: crypto.randomUUID(),
      scope: { countryId: input.countryId, productId: input.productId, partnerTenantId: input.partnerTenantId },
      result: "success",
      context: { ...result }
    });
    return result;
  }
}

export class RoutingModule {
  readonly service: RoutingPrecheckService;

  constructor(consent: ConsentService, partnerEligibility: PartnerEligibilityService, audit = new AuditLogWriter()) {
    this.service = new RoutingPrecheckService(consent, partnerEligibility, audit);
  }
}
