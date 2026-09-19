import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import { BillingAccessRefusedError, BillingFoundationService } from "./billing-foundation.service";
import { BillingPlansService } from "./billing-plans.service";
import { MemoryBillingRepository, type BillingRepository } from "./billing.repository";
import { DraftInvoiceService } from "./draft-invoice.service";
import { LeadPacksService } from "./lead-packs.service";

export interface BillingModuleDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  assignments: LeadAssignmentService;
  countries: CountriesService;
  products: ProductsService;
  partnerLicenses: PartnerLicensesService;
  repository?: BillingRepository | undefined;
  crmActivity?: CrmActivityRepository | undefined;
}

export class BillingModule {
  readonly foundation: BillingFoundationService;
  readonly plans: BillingPlansService;
  readonly packs: LeadPacksService;
  readonly drafts: DraftInvoiceService;

  constructor(deps: BillingModuleDeps) {
    const repository = deps.repository ?? new MemoryBillingRepository();
    this.foundation = new BillingFoundationService(deps);
    this.plans = new BillingPlansService({ audit: deps.audit, featureFlags: deps.featureFlags, countries: deps.countries, repository });
    this.packs = new LeadPacksService({ audit: deps.audit, featureFlags: deps.featureFlags, partners: deps.partners, repository });
    this.drafts = new DraftInvoiceService({
      audit: deps.audit,
      featureFlags: deps.featureFlags,
      partners: deps.partners,
      assignments: deps.assignments,
      countries: deps.countries,
      products: deps.products,
      packs: this.packs,
      repository,
      ...(deps.crmActivity ? { crmActivity: deps.crmActivity } : {})
    });
  }
}

export { BillingAuditActions } from "./billing-audit-actions";
export { BillingAccessRefusedError, BillingFoundationService };
export { BillableLeadPolicy } from "./billable-lead-policy";
export { BILLING_REPOSITORY, MemoryBillingRepository, PrismaBillingRepository, type BillingRepository } from "./billing.repository";
