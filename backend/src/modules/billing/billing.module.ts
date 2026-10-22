import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import { MemoryDocumentStorage, type DocumentStoragePort } from "../quote-documents/document-storage.port";
import { BillingAccessRefusedError, BillingFoundationService } from "./billing-foundation.service";
import { BillingPlansService } from "./billing-plans.service";
import { MemoryBillingRepository, type BillingRepository } from "./billing.repository";
import { BillingAddOnsService } from "./billing-addons.service";
import { DraftInvoiceService, setupFeeInvoicedPort } from "./draft-invoice.service";
import { PartnerSubscriptionsService } from "./partner-subscriptions.service";
import { MemoryPlanChangeRequestsRepository, type PlanChangeRequestsRepository } from "./plan-change-requests.repository";
import { PlanChangeRequestsService } from "./plan-change-requests.service";
import { LeadPacksService } from "./lead-packs.service";
import { resolveInvoicingConfig, type InvoicingConfig } from "./invoicing.config";
import { MemoryInvoicingRepository, type InvoicingRepository } from "./invoicing.repository";
import { InvoicingService, type InvoiceInAppPublisher } from "./invoicing.service";

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
  /** Spec 060: issued invoices, payments and credit notes. */
  invoicingRepository?: InvoicingRepository | undefined;
  /** Spec 060: where invoice and credit note PDFs are stored (shared document storage). */
  documentStorage?: DocumentStoragePort | undefined;
  inApp?: InvoiceInAppPublisher | undefined;
  invoicingConfig?: InvoicingConfig | undefined;
  // Lot 5 (spec 071)
  /** G-06 plan change requests; in-memory without it. */
  planChangeRepository?: PlanChangeRequestsRepository | undefined;
  /** Duplicate-blocked quote requests among ids (non-duplicate billing criterion). */
  quoteDuplicates?: ((quoteRequestIds: string[]) => Promise<Set<string>>) | undefined;
  // End Lot 5
}

export class BillingModule {
  readonly foundation: BillingFoundationService;
  readonly plans: BillingPlansService;
  readonly packs: LeadPacksService;
  readonly drafts: DraftInvoiceService;
  readonly invoicing: InvoicingService;
  // Lot 5 (spec 071)
  readonly addOns: BillingAddOnsService;
  readonly subscriptions: PartnerSubscriptionsService;
  readonly planChanges: PlanChangeRequestsService;
  // End Lot 5

  constructor(deps: BillingModuleDeps) {
    const repository = deps.repository ?? new MemoryBillingRepository();
    const invoicingRepository = deps.invoicingRepository ?? new MemoryInvoicingRepository();
    this.foundation = new BillingFoundationService(deps);
    this.plans = new BillingPlansService({ audit: deps.audit, featureFlags: deps.featureFlags, countries: deps.countries, repository });
    this.packs = new LeadPacksService({
      audit: deps.audit,
      featureFlags: deps.featureFlags,
      partners: deps.partners,
      repository,
      invoices: { find: (id) => invoicingRepository.findInvoice(id) }
    });
    this.invoicing = new InvoicingService({
      audit: deps.audit,
      featureFlags: deps.featureFlags,
      partners: deps.partners,
      countries: deps.countries,
      billing: repository,
      repository: invoicingRepository,
      storage: deps.documentStorage ?? new MemoryDocumentStorage(),
      packs: this.packs,
      config: deps.invoicingConfig ?? resolveInvoicingConfig(),
      inApp: deps.inApp
    });
    // Lot 5 (spec 071)
    this.subscriptions = new PartnerSubscriptionsService({ audit: deps.audit, partners: deps.partners, countries: deps.countries, repository });
    this.planChanges = new PlanChangeRequestsService({
      audit: deps.audit,
      partners: deps.partners,
      countries: deps.countries,
      repository: deps.planChangeRepository ?? new MemoryPlanChangeRequestsRepository(),
      inApp: deps.inApp
    });
    this.addOns = new BillingAddOnsService({
      audit: deps.audit,
      featureFlags: deps.featureFlags,
      countries: deps.countries,
      partners: deps.partners,
      repository,
      effectivePlan: (partnerId, currentPlan, at) => this.planChanges.effectivePlan(partnerId, currentPlan, at)
    });
    // End Lot 5
    this.drafts = new DraftInvoiceService({
      audit: deps.audit,
      featureFlags: deps.featureFlags,
      partners: deps.partners,
      assignments: deps.assignments,
      countries: deps.countries,
      products: deps.products,
      packs: this.packs,
      repository,
      isPeriodInvoiced: (partnerId, periodFrom) => this.invoicing.hasActiveInvoice(partnerId, periodFrom),
      // Lot 5 (spec 071)
      hasActiveSetupFeeInvoice: setupFeeInvoicedPort(invoicingRepository),
      effectivePlan: (partnerId, currentPlan, at) => this.planChanges.effectivePlan(partnerId, currentPlan, at),
      ...(deps.quoteDuplicates ? { quoteDuplicates: deps.quoteDuplicates } : {}),
      // End Lot 5
      ...(deps.crmActivity ? { crmActivity: deps.crmActivity } : {})
    });
  }
}

export { BillingAuditActions } from "./billing-audit-actions";
export { BillingAccessRefusedError, BillingFoundationService };
export { BillableLeadPolicy } from "./billable-lead-policy";
export { InvoicingService } from "./invoicing.service";
export { InvoiceConflictError, InvoiceIntegrityError, InvoiceNotFoundError, InvoicingConfigurationError } from "./invoicing-errors";
export { MemoryInvoicingRepository, PrismaInvoicingRepository, type InvoicingRepository } from "./invoicing.repository";
export { BILLING_REPOSITORY, MemoryBillingRepository, PrismaBillingRepository, type BillingRepository } from "./billing.repository";
