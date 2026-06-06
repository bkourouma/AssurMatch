import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnersService } from "../partners/partners.module";
import { BillingAccessRefusedError, BillingFoundationService } from "./billing-foundation.service";

export interface BillingModuleDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  assignments: LeadAssignmentService;
}

export class BillingModule {
  readonly foundation: BillingFoundationService;

  constructor(deps: BillingModuleDeps) {
    this.foundation = new BillingFoundationService(deps);
  }
}

export { BillingAuditActions } from "./billing-audit-actions";
export { BillingAccessRefusedError, BillingFoundationService };
