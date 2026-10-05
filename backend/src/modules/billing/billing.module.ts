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
import { DraftInvoiceService } from "./draft-invoice.service";
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
}

export class BillingModule {
  readonly foundation: BillingFoundationService;
  readonly plans: BillingPlansService;
  readonly packs: LeadPacksService;
  readonly drafts: DraftInvoiceService;
  readonly invoicing: InvoicingService;

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
