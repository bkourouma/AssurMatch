import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { RoutingDecisionService } from "../leads/routing-decision.service";
import type { OffersModule } from "../offers/offers.module";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import type { QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import { AdminDashboardService } from "./admin-dashboard.service";
// Lot 6
import type { AdminAiInsightsPort, AdminInvoicesPort, AdminLeadDisputesPort, AdminVisitStatsPort } from "./admin-dashboard-kpis";
// Lot 6 (end)
import type { AgencyScopePort } from "../common/agency-scope";
import { BrokerDashboardService } from "./broker-dashboard.service";
import { ComplianceAlertsService } from "./compliance-alerts.service";
import { DashboardsAccessPolicy } from "./dashboards-access-policy";

export interface DashboardsModuleConfig {
  brokerCrmConfig: { brokerCrmEnabled: boolean };
}

export interface DashboardsModuleDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  assignments: LeadAssignmentService;
  decisions: RoutingDecisionService;
  partnerLicenses: PartnerLicensesService;
  partners: PartnersService;
  countries: CountriesService;
  products: ProductsService;
  offers: OffersModule;
  quoteRequests: QuoteSubmissionService;
  crmActivity?: CrmActivityRepository | undefined;
  brokerCrmConfig: { brokerCrmEnabled: boolean };
  /** Spec 064: Enterprise display filter by agency (resolved lazily by the runtime). */
  agencyScope?: AgencyScopePort | undefined;
  // Lot 6 (spec 073 T302): read-only ports for the extra admin KPIs, bound lazily by the runtime.
  adminVisitStats?: AdminVisitStatsPort | undefined;
  adminInvoices?: AdminInvoicesPort | undefined;
  adminLeadDisputes?: AdminLeadDisputesPort | undefined;
  adminAiInsights?: AdminAiInsightsPort | undefined;
  // Lot 6 (end)
}

export class DashboardsModule {
  readonly access: DashboardsAccessPolicy;
  readonly broker: BrokerDashboardService;
  readonly admin: AdminDashboardService;
  readonly complianceAlerts: ComplianceAlertsService;

  constructor(private readonly deps: DashboardsModuleDeps) {
    this.access = new DashboardsAccessPolicy(deps.audit);
    this.broker = new BrokerDashboardService({
      access: this.access,
      assignments: deps.assignments,
      partnerLicenses: deps.partnerLicenses,
      countries: deps.countries,
      crmActivity: deps.crmActivity,
      agencyScope: deps.agencyScope,
      config: () => ({
        brokerDashboardEnabled: deps.featureFlags.isEnabled("broker_dashboard_enabled"),
        brokerCrmEnabled: deps.brokerCrmConfig.brokerCrmEnabled || deps.featureFlags.isEnabled("broker_crm_enabled")
      })
    });
    this.admin = new AdminDashboardService({
      access: this.access,
      audit: deps.audit,
      featureFlags: deps.featureFlags,
      assignments: deps.assignments,
      decisions: deps.decisions,
      quoteRequests: deps.quoteRequests,
      partnerLicenses: deps.partnerLicenses,
      partners: deps.partners,
      offers: deps.offers,
      countries: deps.countries,
      products: deps.products,
      // Lot 6
      visitStats: deps.adminVisitStats,
      invoices: deps.adminInvoices,
      leadDisputes: deps.adminLeadDisputes,
      aiInsights: deps.adminAiInsights
      // Lot 6 (end)
    });
    this.complianceAlerts = new ComplianceAlertsService({ access: this.access, audit: deps.audit });
  }
}
