import { QuoteAISummaryService } from "../modules/ai/quote-summary/quote-ai-summary.service";
import { ActivationChecklistModule } from "../modules/activation-checklist/activation-checklist.module";
import { AIModule } from "../modules/ai/ai.module";
import { BillingModule } from "../modules/billing/billing.module";
import { PrismaBillingRepository } from "../modules/billing/billing.repository";
import { AuditLogsModule } from "../modules/audit-logs/audit-logs.module";
import { PrismaAuditLogRepository } from "../modules/audit-logs/audit-log-repository";
import { ConfigModule } from "../config/config.module";
import { PrismaService } from "../modules/common/prisma/prisma.service";
import { QueuesModule } from "../modules/common/queues/queues.module";
import { RedisModule } from "../modules/common/redis/redis.module";
import { ConsentModule } from "../modules/consent/consent.module";
import { ContactMessagesModule } from "../modules/contact-messages/contact-messages.module";
import { MemoryContactMessagesRepository, PrismaContactMessagesRepository } from "../modules/contact-messages/contact-messages.repository";
import { DataRetentionModule } from "../modules/data-retention/data-retention.module";
import { PrismaDataRetentionRepository } from "../modules/data-retention/data-retention.repository";
import { PrismaRetentionSubjectsRepository, type MemoryRetentionSources } from "../modules/data-retention/retention-subjects.repository";
import { CountriesModule } from "../modules/countries/countries.module";
import { PublicCountryDirectoryService } from "../modules/countries/public-country-directory.service";
import { DocumentsModule } from "../modules/documents/documents.module";
import { FeatureFlagsModule } from "../modules/feature-flags/feature-flags.module";
import { FeatureFlagCacheService } from "../modules/feature-flags/feature-flag-cache.service";
import { PrismaFeatureFlagRepository } from "../modules/feature-flags/feature-flag-repository";
import { LeadsModule } from "../modules/leads/leads.module";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { MemoryMessagingRepository, PrismaMessagingRepository } from "../modules/notifications/messaging.repository";
import { BrokerNotificationsService } from "../modules/notifications/broker-notifications.service";
import { EnterpriseService } from "../modules/enterprise/enterprise.service";
import { PrismaEnterpriseRepository } from "../modules/enterprise/enterprise.repository";
import { OffersModule } from "../modules/offers/offers.module";
import { PartnerApplicationsModule } from "../modules/partner-applications/partner-applications.module";
import { MemoryPartnerApplicationsRepository, PrismaPartnerApplicationsRepository } from "../modules/partner-applications/partner-applications.repository";
import { PartnerLicensesModule } from "../modules/partner-licenses/partner-licenses.module";
import { PartnersModule } from "../modules/partners/partners.module";
import { PublicPartnerDirectoryService } from "../modules/partners/public-partner-directory.service";
import { ProductsModule } from "../modules/products/products.module";
import { PublicStatsModule } from "../modules/public-stats/public-stats.module";
import { WaitlistModule } from "../modules/waitlist/waitlist.module";
import { MemoryWaitlistRepository, PrismaWaitlistRepository } from "../modules/waitlist/waitlist.repository";
import { ProspectsModule } from "../modules/prospects/prospects.module";
import { QuoteFormsModule } from "../modules/quote-forms/quote-forms.module";
import { QuoteRequestsModule } from "../modules/quote-requests/quote-requests.module";
import { RegulatoryRegimesModule } from "../modules/regulatory-regimes/regulatory-regimes.module";
import { RoutingModule } from "../modules/routing/routing.module";
import { AiGateway } from "../modules/ai/core/ai-gateway.service";
import { MemoryAiInteractionsRepository, PrismaAiInteractionsRepository } from "../modules/ai/core/ai-interactions.repository";
import { resolveAiProvider } from "../modules/ai/core/ai-provider.config";
import { VisitorAiService } from "../modules/ai/visitor-ai.service";
import { BrokerAiService } from "../modules/ai/broker-ai.service";
import { AdminAiService } from "../modules/ai/admin-ai.service";
import { LeadReassignmentService } from "../modules/routing/lead-reassignment.service";
import { ManualRoutingService } from "../modules/routing/manual-routing.service";
import { PrismaRoutingRulesRepository } from "../modules/routing/routing-rules.repository";
import { RoutingRulesService } from "../modules/routing/routing-rules.service";
import { SystemHealthModule } from "../modules/admin/system-health.module";
import { UsersModule } from "../modules/users/users.module";
import { PrismaUsersRepository } from "../modules/users/users.repository";
import { AuthModule } from "../modules/auth/auth.module";
import { RuntimeEmailDeliveryService } from "../modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../modules/notifications/quote-notification-delivery.service";
import { PartnerEligibilityService } from "../modules/partners/partner-eligibility.service";
import { PartnerIntegrationsModule } from "../modules/partner-integrations/partner-integrations.module";
import { MemoryPartnerIntegrationsRepository, PrismaPartnerIntegrationsRepository } from "../modules/partner-integrations/partner-integrations.repository";
import { PartnerWebhookEventPublisher } from "../modules/partner-integrations/partner-webhook-event-publisher";
import { PrismaConsentRecordsRepository } from "../modules/consent/consent-records.repository";
import { MemoryCountriesRepository, PrismaCountriesRepository, type CountriesRepository } from "../modules/countries/countries.repository";
import { PrismaProductsRepository } from "../modules/products/products.repository";
import { PrismaOffersRepository } from "../modules/offers/offers.repository";
import type { PublicOfferVisibilityContext } from "../modules/offers/public-offer-catalog.service";
import { PrismaScoringRulesRepository } from "../modules/offers/scoring-rules.repository";
import { resolveDocumentStorage, resolveVirusScanner } from "../modules/quote-documents/quote-documents.config";
import { MemoryQuoteDocumentsRepository, PrismaQuoteDocumentsRepository } from "../modules/quote-documents/quote-documents.repository";
import { QuoteDocumentsService } from "../modules/quote-documents/quote-documents.service";
import { ScoringRulesService } from "../modules/offers/scoring-rules.service";
import { PrismaPartnersRepository } from "../modules/partners/partners.repository";
import { PrismaPartnerLicensesRepository } from "../modules/partner-licenses/partner-licenses.repository";
import { PrismaProspectsRepository } from "../modules/prospects/prospects.repository";
import { PrismaQuoteFormDefinitionsRepository } from "../modules/quote-forms/quote-form-definitions.repository";
import { PrismaQuoteRequestsRepository } from "../modules/quote-requests/quote-requests.repository";
import { PrismaLeadAssignmentsRepository } from "../modules/leads/lead-assignments.repository";
import { PrismaRoutingDecisionsRepository } from "../modules/leads/routing-decisions.repository";
import { PrismaCrmActivityRepository } from "../modules/leads/crm-activity.repository";
import { PrismaNotificationsRepository } from "../modules/notifications/notifications.repository";
import { DashboardsModule } from "../modules/dashboards/dashboards.module";
import { aiSurfaceSchema } from "../../../packages/shared/contracts/ai.contracts";
import { maybeBootstrapAdmin } from "./local-bootstrap-admin";

export class AssurMatchRuntime {
  readonly config = new ConfigModule();
  readonly prisma = new PrismaService();
  readonly redis = new RedisModule();
  readonly queues = new QueuesModule();
  private readonly auditLogRepository = this.auditRepository();
  private readonly featureFlagRepository = this.runtimeRepository(new PrismaFeatureFlagRepository(this.prisma));
  /**
   * Spec 045: `PublicCountryDirectoryService` reads the countries repository directly (it needs the
   * unfiltered `list()`, which `CountriesService` does not expose), so the instance has to be shared
   * with `CountriesModule`. Under NODE_ENV=test `runtimeRepository()` yields undefined and
   * `CountriesService` would otherwise build a second, empty memory store.
   */
  private readonly countriesRepository: CountriesRepository =
    this.runtimeRepository(new PrismaCountriesRepository(this.prisma)) ?? new MemoryCountriesRepository();
  private readonly productsRepository = this.runtimeRepository(new PrismaProductsRepository(this.prisma));
  private readonly partnersRepository = this.runtimeRepository(new PrismaPartnersRepository(this.prisma));
  private readonly partnerLicensesRepository = this.runtimeRepository(new PrismaPartnerLicensesRepository(this.prisma));
  private readonly consentRecordsRepository = this.runtimeRepository(new PrismaConsentRecordsRepository(this.prisma));
  private readonly notificationsRepository = this.runtimeRepository(new PrismaNotificationsRepository(this.prisma));
  private readonly usersRepository = this.runtimeRepository(new PrismaUsersRepository(this.prisma));
  private readonly partnerIntegrationsRepository = this.runtimeRepository(new PrismaPartnerIntegrationsRepository(this.prisma)) ?? new MemoryPartnerIntegrationsRepository();
  private readonly offersRepository = this.runtimeRepository(new PrismaOffersRepository(this.prisma));
  private readonly prospectsRepository = this.runtimeRepository(new PrismaProspectsRepository(this.prisma));
  private readonly quoteFormDefinitionsRepository = this.runtimeRepository(new PrismaQuoteFormDefinitionsRepository(this.prisma));
  private readonly quoteRequestsRepository = this.runtimeRepository(new PrismaQuoteRequestsRepository(this.prisma));
  private readonly routingRulesRepository = this.runtimeRepository(new PrismaRoutingRulesRepository(this.prisma));
  private readonly scoringRulesRepository = this.runtimeRepository(new PrismaScoringRulesRepository(this.prisma));
  private readonly quoteDocumentsRepository = this.runtimeRepository(new PrismaQuoteDocumentsRepository(this.prisma)) ?? new MemoryQuoteDocumentsRepository();
  private readonly waitlistRepository = this.runtimeRepository(new PrismaWaitlistRepository(this.prisma)) ?? new MemoryWaitlistRepository();
  private readonly partnerApplicationsRepository = this.runtimeRepository(new PrismaPartnerApplicationsRepository(this.prisma)) ?? new MemoryPartnerApplicationsRepository();
  /**
   * Spec 046: under NODE_ENV=test the repositories below that end in `?? new Memory...()` are
   * memory instances owned here rather than inside their modules, so the retention anonymizer reads
   * and scrubs the very records the modules hold.
   */
  private readonly contactMessagesRepository = this.runtimeRepository(new PrismaContactMessagesRepository(this.prisma)) ?? new MemoryContactMessagesRepository();
  readonly leadRepositorySet = this.leadRepositories();
  private readonly brokerCrmConfig = { brokerCrmEnabled: process.env.ASSURMATCH_BROKER_CRM_ENABLED === "true" };
  readonly audit = new AuditLogsModule(this.auditLogRepository);
  readonly emailDelivery = new RuntimeEmailDeliveryService(this.config.config.email, this.audit.writer);
  /**
   * Partner integrations are constructed later in this runtime, so the preparer is resolved lazily
   * at publication time. Webhook failures never propagate into the lead or notification flow.
   */
  readonly partnerWebhookEvents: PartnerWebhookEventPublisher = new PartnerWebhookEventPublisher({
    audit: this.audit.writer,
    integrations: {
      prepareWebhookDelivery: (input): Promise<unknown> => this.partnerIntegrations.service.prepareWebhookDelivery(input)
    }
  });
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
  private readonly messagingRepository = this.runtimeRepository(new PrismaMessagingRepository(this.prisma)) ?? new MemoryMessagingRepository();
  readonly notifications = new NotificationsModule(this.audit.writer, this.queues.notifications, this.notificationsRepository, {
    smsProvider: process.env.ASSURMATCH_SMS_PROVIDER,
    smsSecretConfigured: Boolean(process.env.ASSURMATCH_SMS_API_KEY),
    whatsappProvider: process.env.ASSURMATCH_WHATSAPP_PROVIDER,
    whatsappSecretConfigured: Boolean(process.env.ASSURMATCH_WHATSAPP_API_KEY)
  }, this.featureFlags.service, this.messagingRepository, this.partnerWebhookEvents);
  readonly brokerNotifications = new BrokerNotificationsService({ audit: this.audit.writer, dispatch: this.notifications.dispatch });
  private readonly enterpriseRepository = this.runtimeRepository(new PrismaEnterpriseRepository(this.prisma));
  private readonly aiInteractionsRepository = this.runtimeRepository(new PrismaAiInteractionsRepository(this.prisma)) ?? new MemoryAiInteractionsRepository();
  private readonly aiProviders = resolveAiProvider();
  readonly aiGateway = new AiGateway({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    provider: this.aiProviders.primary,
    fallbackProvider: this.aiProviders.fallback,
    queue: this.queues.notifications,
    redis: this.redis.client,
    ...(this.aiInteractionsRepository ? { repository: this.aiInteractionsRepository } : {}),
    // Tests drive queued visitor interactions explicitly through processPending().
    autoProcess: process.env.NODE_ENV !== "test"
  });
  readonly ai = new AIModule(this.audit.writer, this.featureFlags.service, this.aiGateway);
  readonly visitorAi = new VisitorAiService({
    audit: this.audit.writer,
    gateway: this.aiGateway,
    redis: this.redis.client,
    countries: this.countries.service,
    products: this.products.service
  });
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
  readonly scoringRules = new ScoringRulesService({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service,
    ...(this.scoringRulesRepository ? { repository: this.scoringRulesRepository } : {})
  });
  readonly quoteForms = new QuoteFormsModule(this.audit.writer, {
    consentTexts: async () => (await this.consent.service.listTexts()).map((text) => ({
      id: text.id,
      version: text.version,
      contentHash: text.contentHash,
      purpose: "lead_transmission" as const,
      recipientCategory: text.recipientCategory,
      status: text.status ?? "draft"
    })),
    // Spec 043 D3: the form is what actually collects the data, so publishing one with sensitive
    // fields is what the product flag has to gate.
    sensitiveDataEnabled: (productId: string) => this.featureFlags.service.isEnabled("product_sensitive_data_enabled", "product", productId),
    ...(this.quoteFormDefinitionsRepository ? { repository: this.quoteFormDefinitionsRepository } : {})
  });
  readonly prospects = new ProspectsModule(this.audit.writer, this.prospectsRepository);
  readonly routingRules = new RoutingRulesService({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service,
    partners: this.partners.service,
    ...(this.routingRulesRepository ? { repository: this.routingRulesRepository } : {})
  });
  readonly leads = new LeadsModule(
    this.partners.service,
    this.partnerLicenses.service,
    this.audit.writer,
    this.brokerCrmConfig,
    this.leadRepositorySet,
    {
      rules: this.routingRules,
      events: this.partnerWebhookEvents,
      // Spec 042: multi-send needs the flag open AND the visitor's own recorded consent.
      consent: { findRecord: (id: string) => this.consent.service.findRecord(id) },
      multiBroker: { isEnabled: () => this.featureFlags.service.isEnabled("multi_broker_routing_enabled") }
    }
  );
  readonly enterprise = new EnterpriseService({
    audit: this.audit.writer,
    partners: this.partners.service,
    assignments: this.leads.assignments,
    ...(this.enterpriseRepository ? { repository: this.enterpriseRepository } : {})
  });
  readonly quoteRequests = new QuoteRequestsModule({
    countries: this.countries.service,
    products: this.products.service,
    forms: this.quoteForms.service,
    consent: this.consent.service,
    identity: this.prospects.identity,
    prospects: this.prospects.service,
    routing: this.leads.routing,
    notifications: this.notifications.quoteService,
    aiSummary: this.quoteAiSummary,
    // Spec 045 consent withdrawal: closes the lead assignments and warns each partner inbox.
    assignments: this.leads.assignments,
    inApp: this.notifications.dispatch,
    isGlobalFlagEnabled: (key) => this.featureFlags.service.isEnabled(key)
  }, this.audit.writer, this.redis.client, this.quoteRequestsRepository);
  /** Spec 044: drains the quote notification backlog into the email delivery service. */
  readonly quoteNotificationDelivery = new QuoteNotificationDeliveryService({
    notifications: this.notifications.service,
    email: this.emailDelivery,
    templates: new QuoteEmailTemplateService(),
    audit: this.audit.writer,
    // The stored row keeps ids only, so the ISO code and product key are resolved from the catalogue.
    quotes: { findById: (id: string) => this.resolveQuoteScope(id) },
    prospects: { findById: (id: string) => this.prospects.service.require(id).catch(() => undefined) },
    partners: { findById: (id: string) => this.partners.service.require(id).catch(() => undefined) }
  });
  /** Shared by uploads and by the retention anonymizer, which deletes the files (spec 046). */
  readonly documentStorage = resolveDocumentStorage();
  readonly quoteDocuments = new QuoteDocumentsService({
    audit: this.audit.writer,
    storage: this.documentStorage,
    scanner: resolveVirusScanner(),
    queue: this.queues.notifications,
    redis: this.redis.client,
    submissions: this.quoteRequests.submissions,
    countries: this.countries.service,
    products: this.products.service,
    assignments: this.leads.assignments,
    crmDocuments: this.leads.crmActivityRepository,
    notifications: this.notifications.service,
    isGlobalFlagEnabled: (key) => this.featureFlags.service.isEnabled(key),
    ...(this.quoteDocumentsRepository ? { repository: this.quoteDocumentsRepository } : {}),
    // Tests drive scans explicitly through processPendingScans(); runtime scans right after the response.
    autoProcess: process.env.NODE_ENV !== "test",
    requireDurableStorage: process.env.APP_ENV === "production" || process.env.APP_ENV === "preproduction"
  });
  readonly brokerAi = new BrokerAiService({
    audit: this.audit.writer,
    gateway: this.aiGateway,
    featureFlags: this.featureFlags.service,
    crmLeads: this.leads.brokerCrmLeads,
    assignments: this.leads.assignments,
    access: this.leads.brokerCrmAccess,
    countries: this.countries.service,
    products: this.products.service
  });
  readonly manualRouting = new ManualRoutingService({
    audit: this.audit.writer,
    submissions: this.quoteRequests.submissions,
    eligibility: this.leads.eligibility,
    countries: this.countries.service,
    afterAssign: async (quoteRequestId, assignmentId) => {
      await this.quoteDocuments.shareForAssignment(quoteRequestId, await this.leads.assignments.require(assignmentId));
    }
  });
  readonly leadReassignment = new LeadReassignmentService({
    audit: this.audit.writer,
    assignments: this.leads.assignments,
    eligibility: this.leads.eligibility,
    decisions: this.leads.decisions,
    countries: this.countries.service,
    products: this.products.service,
    notifyBroker: async (assignment, actor) => {
      const notificationId = await this.quoteRequests.submissions.notifyBrokerForAssignment(assignment, actor);
      await this.quoteDocuments.shareForAssignment(assignment.quoteRequestId, assignment);
      return notificationId;
    }
  });
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
    products: this.products.service,
    offers: this.offers,
    quoteRequests: this.quoteRequests.submissions,
    crmActivity: this.leadRepositorySet.crmActivity,
    brokerCrmConfig: this.brokerCrmConfig
  });
  readonly activationChecklist = new ActivationChecklistModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    countries: this.countries.service,
    products: this.products.service,
    partners: this.partners.service,
    partnerLicenses: this.partnerLicenses.service,
    offers: this.offers,
    quoteForms: this.quoteForms.service,
    consent: this.consent.service
  });
  readonly adminAi = new AdminAiService({
    audit: this.audit.writer,
    gateway: this.aiGateway,
    dashboard: this.dashboards.admin,
    complianceAlerts: this.dashboards.complianceAlerts,
    activationChecklist: this.activationChecklist.service,
    offers: this.offers.repository,
    quoteRequests: this.quoteRequests.submissions
  });
  private readonly billingRepository = this.runtimeRepository(new PrismaBillingRepository(this.prisma));
  readonly billing = new BillingModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    partners: this.partners.service,
    assignments: this.leads.assignments,
    countries: this.countries.service,
    products: this.products.service,
    partnerLicenses: this.partnerLicenses.service,
    crmActivity: this.leads.crmActivityRepository,
    ...(this.billingRepository ? { repository: this.billingRepository } : {})
  });
  readonly partnerIntegrations = new PartnerIntegrationsModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    partners: this.partners.service,
    assignments: this.leads.assignments,
    notifications: this.notifications.service,
    webhookDeliveryEnabled: process.env.ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED === "true",
    ...(this.partnerIntegrationsRepository ? { repository: this.partnerIntegrationsRepository } : {})
  });
  /** Spec 045: public-site intake (waitlist, partner applications, contact) and public read models. */
  readonly waitlist = new WaitlistModule({
    findCountryByCode: (countryCode) => this.countries.service.findByIsoCode(countryCode),
    findProductByKey: (productKey) => this.products.service.findByKey(productKey),
    identity: this.prospects.identity,
    globalFlags: () => this.publicJourneyGlobalFlags()
  }, this.audit.writer, this.redis.client, this.waitlistRepository);
  readonly partnerApplications = new PartnerApplicationsModule({
    findCountryByCode: (countryCode) => this.countries.service.findByIsoCode(countryCode),
    findProductByKey: (productKey) => this.products.service.findByKey(productKey),
    identity: this.prospects.identity
  }, this.audit.writer, this.redis.client, this.partnerApplicationsRepository);
  readonly contactMessages = new ContactMessagesModule({
    findCountryByCode: (countryCode) => this.countries.service.findByIsoCode(countryCode)
  }, this.audit.writer, this.redis.client, this.contactMessagesRepository);
  readonly publicPartnerDirectory = new PublicPartnerDirectoryService(
    this.partners.service,
    this.partnerLicenses.service,
    this.countries.service,
    this.products.service,
    this.redis.client,
    this.audit.writer
  );
  readonly publicStats = new PublicStatsModule(
    this.countries.service,
    this.partners.service,
    this.partnerLicenses.service,
    this.offers.repository,
    this.redis.client
  );
  readonly publicCountryDirectory = new PublicCountryDirectoryService(this.countriesRepository, this.redis.client);
  private readonly dataRetentionRepository = this.runtimeRepository(new PrismaDataRetentionRepository(this.prisma));
  private readonly retentionSubjectsRepository = this.runtimeRepository(new PrismaRetentionSubjectsRepository(this.prisma));
  /** Spec 046: retention policies, retention and erasure batches, anonymization. */
  readonly dataRetention = new DataRetentionModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    identity: this.prospects.identity,
    storage: this.documentStorage,
    requireCountry: (countryId) => this.countries.service.require(countryId),
    listCountries: () => this.countries.service.listAdmin(),
    inApp: this.notifications.dispatch,
    repository: this.dataRetentionRepository,
    subjects: this.retentionSubjectsRepository,
    memorySources: this.retentionSubjectsRepository ? undefined : this.memoryRetentionSources()
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

  publicJourneyGlobalFlags(): Partial<Record<string, boolean>> {
    return {
      public_comparator_enabled: this.featureFlags.service.isEnabled("public_comparator_enabled"),
      quote_request_enabled: this.featureFlags.service.isEnabled("quote_request_enabled"),
      sponsored_offers_enabled: this.featureFlags.service.isEnabled("sponsored_offers_enabled")
    };
  }

  /**
   * Shared visibility/enrichment context for every public offer read (list, detail, compare) so
   * both HTTP wiring paths apply identical flags, eligibility, partner naming, popularity and scoring.
   */
  publicOfferContext(input: { countryFlags?: Partial<Record<string, boolean>> | undefined; productFlags?: Partial<Record<string, boolean>> | undefined } = {}): PublicOfferVisibilityContext {
    return {
      globalFlags: this.publicJourneyGlobalFlags(),
      ...(input.countryFlags ? { countryFlags: input.countryFlags } : { resolveCountryFlags: async (countryId: string) => (await this.countries.service.require(countryId)).flags }),
      ...(input.productFlags ? { productFlags: input.productFlags } : { resolveProductFlags: async (productId: string) => (await this.products.service.require(productId)).flags }),
      evaluatePartnerEligibility: (partnerTenantId, countryId, productId) => this.publicOfferPartnerEligibility(partnerTenantId, countryId, productId),
      resolvePartnerName: async (partnerTenantId) => {
        const partner = await this.partners.service.require(partnerTenantId).catch(() => undefined);
        return (partner as { tradeName?: string } | undefined)?.tradeName ?? partner?.legalName;
      },
      resolvePopularity: async (offerIds) => {
        const wanted = new Set(offerIds);
        const counts = new Map<string, number>();
        for (const quote of await this.quoteRequests.submissions.list()) {
          if (quote.selectedOfferId && wanted.has(quote.selectedOfferId)) counts.set(quote.selectedOfferId, (counts.get(quote.selectedOfferId) ?? 0) + 1);
        }
        return counts;
      },
      resolveScoringWeights: (countryId, productId) => this.scoringRules.resolveWeights(countryId, productId)
    };
  }

  async publicOfferPartnerEligibility(partnerTenantId: string, countryId: string, productId: string): Promise<{ eligible: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    const partner = await this.partners.service.require(partnerTenantId);
    if (partner.status !== "active") reasons.push("partner_not_active");
    if (partner.capacityStatus === "blocked" || partner.capacityStatus === "full") reasons.push("partner_capacity_blocked");
    if (!await this.partners.service.isAuthorizedForCountry(partnerTenantId, countryId)) reasons.push("partner_country_not_authorized");
    if (!await this.partners.service.isAuthorizedForProduct(partnerTenantId, productId)) reasons.push("partner_product_not_authorized");
    if (!await this.partnerLicenses.service.eligible(partnerTenantId, countryId, productId)) reasons.push("license_not_valid_for_scope");
    return { eligible: reasons.length === 0, reasons };
  }

  runtimeRepositoryModes(): Record<string, string | undefined> {
    return {
      AuditLogRepository: this.auditLogRepository?.mode,
      FeatureFlagRepository: this.featureFlagRepository?.mode,
      CountriesRepository: this.countriesRepository?.mode,
      ProductsRepository: this.productsRepository?.mode,
      OffersRepository: this.offersRepository?.mode,
      ProspectsRepository: this.prospectsRepository?.mode,
      QuoteFormDefinitionsRepository: this.quoteFormDefinitionsRepository?.mode,
      ConsentRecordsRepository: this.consentRecordsRepository?.mode,
      QuoteRequestsRepository: this.quoteRequestsRepository?.mode,
      LeadAssignmentsRepository: this.leadRepositorySet.assignments?.mode,
      RoutingDecisionsRepository: this.leadRepositorySet.decisions?.mode,
      PartnersRepository: this.partnersRepository?.mode,
      PartnerLicensesRepository: this.partnerLicensesRepository?.mode,
      CrmActivityRepository: this.leadRepositorySet.crmActivity?.mode,
      NotificationsRepository: this.notificationsRepository?.mode,
      UsersRepository: this.usersRepository?.mode,
      PartnerIntegrationsRepository: this.partnerIntegrationsRepository?.mode,
      WaitlistRepository: this.waitlistRepository?.mode,
      PartnerApplicationsRepository: this.partnerApplicationsRepository?.mode,
      ContactMessagesRepository: this.contactMessagesRepository?.mode,
      DataRetentionRepository: this.dataRetentionRepository?.mode,
      RetentionSubjectsRepository: this.retentionSubjectsRepository?.mode
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

  /**
   * Spec 044: the `QuoteRequest` table stores `countryId`/`productId` only - the Prisma repository
   * strips the codes on write - so a record read back has `countryCode` and `productKey` undefined.
   * Notification templates need the human-readable scope, so it is resolved from the catalogue here
   * rather than by widening the repository contract for one consumer.
   */
  private async resolveQuoteScope(id: string) {
    const quote = await this.quoteRequests.submissions.findById(id);
    if (!quote) return undefined;
    if (quote.countryCode && quote.productKey) return quote;
    const [country, product] = await Promise.all([
      this.countries.service.require(quote.countryId).catch(() => undefined),
      this.products.service.require(quote.productId).catch(() => undefined)
    ]);
    return {
      ...quote,
      ...(country?.isoCode ? { countryCode: country.isoCode } : {}),
      ...(product?.key ? { productKey: product.key } : {})
    };
  }

  /** Test runtime only: the live memory records behind each data category of spec 046. */
  private memoryRetentionSources(): MemoryRetentionSources {
    const quoteDocuments = this.quoteDocumentsRepository;
    const aiInteractions = this.aiInteractionsRepository;
    return {
      countries: () => this.countries.service.listAdmin(),
      prospects: () => this.prospects.service.list(),
      quoteRequests: () => this.quoteRequests.submissions.list(),
      quoteDocuments: async () => (await Promise.all((await this.quoteRequests.submissions.list()).map((quote) => quoteDocuments.listForQuote(quote.id)))).flat(),
      leadAssignments: () => this.leads.assignments.list(),
      leadHistory: (leadAssignmentId) => this.leads.assignmentsRepository.historyForLead(leadAssignmentId),
      crmActivity: this.leads.crmActivityRepository,
      quoteAiSummaries: async () => this.quoteAiSummary.list(),
      aiInteractions: async () => (await Promise.all(aiSurfaceSchema.options.map((surface) => aiInteractions.listForSurface(surface, Number.MAX_SAFE_INTEGER)))).flat(),
      contactMessages: () => this.contactMessagesRepository.list({}),
      partnerApplications: () => this.partnerApplicationsRepository.list(),
      waitlistEntries: () => this.waitlistRepository.list(),
      webhookDeliveries: () => this.partnerIntegrationsRepository.listDeliveries(),
      notifications: () => this.notifications.service.list(),
      messagingDeliveries: () => this.messagingRepository.listDeliveries(Number.MAX_SAFE_INTEGER)
    };
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
