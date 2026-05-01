import { QuoteAISummaryService } from "../modules/ai/quote-summary/quote-ai-summary.service";
import { AIModule } from "../modules/ai/ai.module";
import { AuditLogsModule } from "../modules/audit-logs/audit-logs.module";
import { PrismaAuditLogRepository } from "../modules/audit-logs/audit-log-repository";
import { ConfigModule } from "../config/config.module";
import { PrismaService } from "../modules/common/prisma/prisma.service";
import { QueuesModule } from "../modules/common/queues/queues.module";
import { RedisModule } from "../modules/common/redis/redis.module";
import { ConsentModule } from "../modules/consent/consent.module";
import { CountriesModule } from "../modules/countries/countries.module";
import { DocumentsModule } from "../modules/documents/documents.module";
import { FeatureFlagsModule } from "../modules/feature-flags/feature-flags.module";
import { FeatureFlagCacheService } from "../modules/feature-flags/feature-flag-cache.service";
import { PrismaFeatureFlagRepository } from "../modules/feature-flags/feature-flag-repository";
import { LeadsModule } from "../modules/leads/leads.module";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { OffersModule } from "../modules/offers/offers.module";
import { PartnerLicensesModule } from "../modules/partner-licenses/partner-licenses.module";
import { PartnersModule } from "../modules/partners/partners.module";
import { ProductsModule } from "../modules/products/products.module";
import { ProspectsModule } from "../modules/prospects/prospects.module";
import { QuoteFormsModule } from "../modules/quote-forms/quote-forms.module";
import { QuoteRequestsModule } from "../modules/quote-requests/quote-requests.module";
import { RegulatoryRegimesModule } from "../modules/regulatory-regimes/regulatory-regimes.module";
import { RoutingModule } from "../modules/routing/routing.module";
import { SystemHealthModule } from "../modules/admin/system-health.module";
import { UsersModule } from "../modules/users/users.module";
import { PrismaUsersRepository } from "../modules/users/users.repository";
import { AuthModule } from "../modules/auth/auth.module";
import { RuntimeEmailDeliveryService } from "../modules/notifications/email/email-delivery.service";
import { PartnerEligibilityService } from "../modules/partners/partner-eligibility.service";
import { PrismaConsentRecordsRepository } from "../modules/consent/consent-records.repository";
import { PrismaCountriesRepository } from "../modules/countries/countries.repository";
import { PrismaProductsRepository } from "../modules/products/products.repository";
import { PrismaOffersRepository } from "../modules/offers/offers.repository";
import { PrismaPartnersRepository } from "../modules/partners/partners.repository";
import { PrismaPartnerLicensesRepository } from "../modules/partner-licenses/partner-licenses.repository";
import { PrismaProspectsRepository } from "../modules/prospects/prospects.repository";
import { PrismaQuoteRequestsRepository } from "../modules/quote-requests/quote-requests.repository";
import { PrismaLeadAssignmentsRepository } from "../modules/leads/lead-assignments.repository";
import { PrismaRoutingDecisionsRepository } from "../modules/leads/routing-decisions.repository";
import { PrismaCrmActivityRepository } from "../modules/leads/crm-activity.repository";
import { PrismaNotificationsRepository } from "../modules/notifications/notifications.repository";
import { DashboardsModule } from "../modules/dashboards/dashboards.module";
import { maybeBootstrapAdmin } from "./local-bootstrap-admin";

export class AssurMatchRuntime {
  readonly config = new ConfigModule();
  readonly prisma = new PrismaService();
  readonly redis = new RedisModule();
  readonly queues = new QueuesModule();
  private readonly auditLogRepository = this.auditRepository();
  private readonly featureFlagRepository = this.runtimeRepository(new PrismaFeatureFlagRepository(this.prisma));
  private readonly countriesRepository = this.runtimeRepository(new PrismaCountriesRepository(this.prisma));
  private readonly productsRepository = this.runtimeRepository(new PrismaProductsRepository(this.prisma));
  private readonly partnersRepository = this.runtimeRepository(new PrismaPartnersRepository(this.prisma));
  private readonly partnerLicensesRepository = this.runtimeRepository(new PrismaPartnerLicensesRepository(this.prisma));
  private readonly consentRecordsRepository = this.runtimeRepository(new PrismaConsentRecordsRepository(this.prisma));
  private readonly notificationsRepository = this.runtimeRepository(new PrismaNotificationsRepository(this.prisma));
  private readonly usersRepository = this.runtimeRepository(new PrismaUsersRepository(this.prisma));
  private readonly offersRepository = this.runtimeRepository(new PrismaOffersRepository(this.prisma));
  private readonly prospectsRepository = this.runtimeRepository(new PrismaProspectsRepository(this.prisma));
  private readonly quoteRequestsRepository = this.runtimeRepository(new PrismaQuoteRequestsRepository(this.prisma));
  readonly leadRepositorySet = this.leadRepositories();
  private readonly brokerCrmConfig = { brokerCrmEnabled: process.env.ASSURMATCH_BROKER_CRM_ENABLED === "true" };
  readonly audit = new AuditLogsModule(this.auditLogRepository);
  readonly emailDelivery = new RuntimeEmailDeliveryService(this.config.config.email, this.audit.writer);
  readonly regulatoryRegimes = new RegulatoryRegimesModule(this.audit.writer);
  readonly countries = new CountriesModule(this.audit.writer, this.countriesRepository);
  readonly products = new ProductsModule(this.audit.writer, this.productsRepository);
  readonly partners = new PartnersModule(this.audit.writer, this.partnersRepository);
  readonly partnerLicenses = new PartnerLicensesModule(this.audit.writer, this.partnerLicensesRepository);
  readonly documents = new DocumentsModule(this.audit.writer);
  readonly users = new UsersModule(this.audit.writer, this.usersRepository);
  readonly auth = new AuthModule(this.users.service, this.audit.writer, this.emailDelivery);
  readonly featureFlags = new FeatureFlagsModule(
    this.audit.writer,
    new FeatureFlagCacheService(this.redis.client),
    this.featureFlagRepository
  );
  readonly consent = new ConsentModule(this.audit.writer, this.consentRecordsRepository);
  readonly notifications = new NotificationsModule(this.audit.writer, this.queues.notifications, this.notificationsRepository);
  readonly ai = new AIModule(this.audit.writer);
  readonly quoteAiSummary = new QuoteAISummaryService(this.notifications.queue, this.audit.writer, {
    id: "00000000-0000-4000-8000-000000000002",
    key: "quote_summary",
    status: "disabled",
    guardrailStatus: "not_configured",
    auditPolicy: "metadata_only",
    modelCallCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  }, {
    globalFlags: { ai_summary_enabled: false },
    countryFlags: { country_ai_enabled: false },
    productFlags: { product_ai_form_assistant_enabled: false }
  });
  readonly offers = new OffersModule(this.audit.writer, this.redis.client, this.offersRepository);
  readonly quoteForms = new QuoteFormsModule(this.audit.writer, async () => (await this.consent.service.listTexts()).map((text) => ({
    id: text.id,
    version: text.version,
    contentHash: text.contentHash,
    purpose: "lead_transmission",
    recipientCategory: text.recipientCategory,
    status: text.status ?? "draft"
  })));
  readonly prospects = new ProspectsModule(this.audit.writer, this.prospectsRepository);
  readonly leads = new LeadsModule(
    this.partners.service,
    this.partnerLicenses.service,
    this.audit.writer,
    this.brokerCrmConfig,
    this.leadRepositorySet
  );
  readonly quoteRequests = new QuoteRequestsModule({
    countries: this.countries.service,
    products: this.products.service,
    forms: this.quoteForms.service,
    consent: this.consent.service,
    identity: this.prospects.identity,
    prospects: this.prospects.service,
    routing: this.leads.routing,
    notifications: this.notifications.quoteService,
    aiSummary: this.quoteAiSummary
  }, this.audit.writer, this.redis.client, this.quoteRequestsRepository);
  readonly partnerEligibility = new PartnerEligibilityService(this.partners.service, this.partnerLicenses.service, this.documents.service);
  readonly routing = new RoutingModule(this.consent.service, this.partnerEligibility, this.audit.writer);
  readonly systemHealth = new SystemHealthModule(this.prisma, this.redis.client, this.queues.notifications);
  readonly dashboards = new DashboardsModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    assignments: this.leads.assignments,
    decisions: this.leads.decisions,
    partnerLicenses: this.partnerLicenses.service,
    partners: this.partners.service,
    countries: this.countries.service,
    offers: this.offers,
    quoteRequests: this.quoteRequests.submissions,
    crmActivity: this.leadRepositorySet.crmActivity,
    brokerCrmConfig: this.brokerCrmConfig
  });

  async onModuleInit(): Promise<void> {
    await this.prisma.onModuleInit();
    await this.featureFlags.service.hydrateFromRepository();
    await maybeBootstrapAdmin({ users: this.users.service, auth: this.auth, audit: this.audit.writer });
    this.refreshRuntimeFeatureFlags();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.onModuleDestroy();
    await this.redis.close();
    await this.queues.close();
  }

  async reloadRuntimeFeatureFlags(): Promise<void> {
    await this.featureFlags.service.hydrateFromRepository();
    this.refreshRuntimeFeatureFlags();
  }

  runtimeRepositoryModes(): Record<string, string | undefined> {
    return {
      AuditLogRepository: this.auditLogRepository?.mode,
      FeatureFlagRepository: this.featureFlagRepository?.mode,
      CountriesRepository: this.countriesRepository?.mode,
      ProductsRepository: this.productsRepository?.mode,
      OffersRepository: this.offersRepository?.mode,
      ProspectsRepository: this.prospectsRepository?.mode,
      ConsentRecordsRepository: this.consentRecordsRepository?.mode,
      QuoteRequestsRepository: this.quoteRequestsRepository?.mode,
      LeadAssignmentsRepository: this.leadRepositorySet.assignments?.mode,
      RoutingDecisionsRepository: this.leadRepositorySet.decisions?.mode,
      PartnersRepository: this.partnersRepository?.mode,
      PartnerLicensesRepository: this.partnerLicensesRepository?.mode,
      CrmActivityRepository: this.leadRepositorySet.crmActivity?.mode,
      NotificationsRepository: this.notificationsRepository?.mode,
      UsersRepository: this.usersRepository?.mode
    };
  }

  private refreshRuntimeFeatureFlags(): void {
    this.brokerCrmConfig.brokerCrmEnabled =
      this.featureFlags.service.isEnabled("broker_crm_enabled") ||
      process.env.ASSURMATCH_BROKER_CRM_ENABLED === "true";
  }

  private auditRepository() {
    if (process.env.NODE_ENV === "test") return undefined;
    return new PrismaAuditLogRepository(this.prisma);
  }

  private runtimeRepository<T>(repository: T): T | undefined {
    return process.env.NODE_ENV === "test" ? undefined : repository;
  }

  private leadRepositories() {
    if (process.env.NODE_ENV === "test") return {};
    return {
      assignments: new PrismaLeadAssignmentsRepository(this.prisma),
      decisions: new PrismaRoutingDecisionsRepository(this.prisma),
      crmActivity: new PrismaCrmActivityRepository(this.prisma)
    };
  }

}
