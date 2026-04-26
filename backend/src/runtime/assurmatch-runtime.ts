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
import { AuthModule } from "../modules/auth/auth.module";
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

export class AssurMatchRuntime {
  readonly config = new ConfigModule();
  readonly prisma = new PrismaService();
  readonly redis = new RedisModule();
  readonly queues = new QueuesModule();
  readonly audit = new AuditLogsModule(this.auditRepository());
  readonly regulatoryRegimes = new RegulatoryRegimesModule(this.audit.writer);
  readonly countries = new CountriesModule(this.audit.writer, this.runtimeRepository(new PrismaCountriesRepository(this.prisma)));
  readonly products = new ProductsModule(this.audit.writer, this.runtimeRepository(new PrismaProductsRepository(this.prisma)));
  readonly partners = new PartnersModule(this.audit.writer, this.runtimeRepository(new PrismaPartnersRepository(this.prisma)));
  readonly partnerLicenses = new PartnerLicensesModule(this.audit.writer, this.runtimeRepository(new PrismaPartnerLicensesRepository(this.prisma)));
  readonly documents = new DocumentsModule(this.audit.writer);
  readonly users = new UsersModule(this.audit.writer);
  readonly auth = new AuthModule(this.users.service);
  readonly featureFlags = new FeatureFlagsModule(
    this.audit.writer,
    new FeatureFlagCacheService(this.redis.client),
    process.env.NODE_ENV === "test" ? undefined : new PrismaFeatureFlagRepository(this.prisma)
  );
  readonly consent = new ConsentModule(this.audit.writer, this.runtimeRepository(new PrismaConsentRecordsRepository(this.prisma)));
  readonly notifications = new NotificationsModule(this.audit.writer, this.queues.notifications, this.runtimeRepository(new PrismaNotificationsRepository(this.prisma)));
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
  readonly offers = new OffersModule(this.audit.writer, this.redis.client, this.runtimeRepository(new PrismaOffersRepository(this.prisma)));
  readonly quoteForms = new QuoteFormsModule(this.audit.writer, async () => (await this.consent.service.listTexts()).map((text) => ({
    id: text.id,
    version: text.version,
    contentHash: text.contentHash,
    purpose: "lead_transmission",
    recipientCategory: text.recipientCategory,
    status: text.status ?? "draft"
  })));
  readonly prospects = new ProspectsModule(this.audit.writer, this.runtimeRepository(new PrismaProspectsRepository(this.prisma)));
  readonly leads = new LeadsModule(
    this.partners.service,
    this.partnerLicenses.service,
    this.audit.writer,
    { brokerCrmEnabled: process.env.ASSURMATCH_BROKER_CRM_ENABLED === "true" },
    this.leadRepositories()
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
  }, this.audit.writer, this.redis.client, this.runtimeRepository(new PrismaQuoteRequestsRepository(this.prisma)));
  readonly partnerEligibility = new PartnerEligibilityService(this.partners.service, this.partnerLicenses.service, this.documents.service);
  readonly routing = new RoutingModule(this.consent.service, this.partnerEligibility, this.audit.writer);
  readonly systemHealth = new SystemHealthModule(this.prisma, this.redis.client, this.queues.notifications);

  async onModuleInit(): Promise<void> {
    await this.prisma.onModuleInit();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.onModuleDestroy();
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
