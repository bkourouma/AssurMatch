import { SatisfactionSurveysModule, PrismaSatisfactionSurveyRepository } from "../modules/satisfaction-surveys/satisfaction-surveys.module";
import { QuoteAISummaryService } from "../modules/ai/quote-summary/quote-ai-summary.service";
import { ActivationChecklistModule } from "../modules/activation-checklist/activation-checklist.module";
import { AIModule } from "../modules/ai/ai.module";
import { BillingModule } from "../modules/billing/billing.module";
import { PrismaBillingRepository } from "../modules/billing/billing.repository";
import { PrismaInvoicingRepository } from "../modules/billing/invoicing.repository";
import { AuditLogsModule } from "../modules/audit-logs/audit-logs.module";
import { PrismaAuditLogRepository } from "../modules/audit-logs/audit-log-repository";
import { ConfigModule } from "../config/config.module";
import { PrismaService } from "../modules/common/prisma/prisma.service";
import { QueuesModule } from "../modules/common/queues/queues.module";
import { RedisModule } from "../modules/common/redis/redis.module";
import { ConsentModule } from "../modules/consent/consent.module";
import { AdminConsentTextsController } from "../modules/consent/admin-consent-texts.controller";
import { ContactMessagesModule } from "../modules/contact-messages/contact-messages.module";
import { MemoryContactMessagesRepository, PrismaContactMessagesRepository } from "../modules/contact-messages/contact-messages.repository";
import { DataRetentionModule } from "../modules/data-retention/data-retention.module";
import { PrismaDataRetentionRepository } from "../modules/data-retention/data-retention.repository";
import { PrismaRetentionSubjectsRepository, type MemoryRetentionSources } from "../modules/data-retention/retention-subjects.repository";
import { CountriesModule, publicCountryFlags, type Country } from "../modules/countries/countries.module";
import { PublicCountryDirectoryService } from "../modules/countries/public-country-directory.service";
import { DocumentsModule, PrismaAccreditationDocumentsRepository } from "../modules/documents/documents.module";
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
import { PartnerAdminService } from "../modules/partners/partner-admin.service";
import { BrokerAccountService } from "../modules/broker-self-service/broker-account.service";
import { BrokerTeamService } from "../modules/broker-self-service/broker-team.service";
import { PartnerRequestAdminService } from "../modules/broker-self-service/partner-request-admin.service";
import { MemoryPartnerChangeRequestsRepository, PrismaPartnerChangeRequestsRepository } from "../modules/broker-self-service/partner-change-requests.repository";
import { UserAccessStatusService } from "../modules/auth/user-access-status.service";
import { AdminUsersController } from "../modules/users/admin-users.controller";
import { PartnerTenantStatusService } from "../modules/partners/partner-tenant-status.service";
import { ProductsModule } from "../modules/products/products.module";
import { PublicStatsModule } from "../modules/public-stats/public-stats.module";
import { WaitlistModule } from "../modules/waitlist/waitlist.module";
import { MemoryWaitlistRepository, PrismaWaitlistRepository } from "../modules/waitlist/waitlist.repository";
import { ProspectsModule } from "../modules/prospects/prospects.module";
import { QuoteFormsModule } from "../modules/quote-forms/quote-forms.module";
import { QuoteRequestsModule } from "../modules/quote-requests/quote-requests.module";
import { PrismaRegulatoryRegimesRepository, RegulatoryRegimesModule } from "../modules/regulatory-regimes/regulatory-regimes.module";
import { CatalogModule } from "../modules/catalog/catalog.module";
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
import { RoutingAnomalyDetectorService } from "../modules/routing/routing-anomaly-detector.service";
import { AdminRoutingAnomaliesController } from "../modules/routing/admin-routing-anomalies.controller";
import { SystemHealthModule } from "../modules/admin/system-health.module";
import { UsersModule } from "../modules/users/users.module";
import { PrismaUsersRepository } from "../modules/users/users.repository";
import { AuthModule } from "../modules/auth/auth.module";
import { RuntimeEmailDeliveryService } from "../modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../modules/notifications/quote-notification-delivery.service";
import { PublicFormNotificationService } from "../modules/notifications/public-form-notification.service";
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
import { PrismaVisitorAccessTokensRepository } from "../modules/quote-requests/visitor-access-tokens.repository";
import { VisitorQuoteNotifier } from "../modules/notifications/visitor-quote-notifier";
import { PrismaLeadAssignmentsRepository } from "../modules/leads/lead-assignments.repository";
import { PrismaRoutingDecisionsRepository } from "../modules/leads/routing-decisions.repository";
import { PrismaCrmActivityRepository } from "../modules/leads/crm-activity.repository";
import { LeadProposalsModule, MemoryLeadProposalsRepository, PrismaLeadProposalsRepository } from "../modules/lead-proposals/lead-proposals.module";
import { PrismaNotificationsRepository } from "../modules/notifications/notifications.repository";
import { BrokerAlertNotifier } from "../modules/notifications/broker-alert-notifier";
import { AdminAlertsService } from "../modules/notifications/admin-alerts.service";
import { MemoryAdminAlertsRepository, MemoryWorkerHeartbeatRepository, PrismaAdminAlertsRepository, PrismaWorkerHeartbeatRepository } from "../modules/notifications/admin-alerts.repository";
import { ScheduledAlertsService, readScheduledAlertsConfig } from "../modules/notifications/scheduled-alerts.service";
import { RuntimeScheduledAlertSources } from "../modules/notifications/scheduled-alert-sources";
import { PrismaNotificationUnsubscribeRepository } from "../modules/satisfaction-surveys/survey-unsubscribe.service";
import type { OfferLifecycleService } from "../modules/offers/offer-lifecycle.service";
import { readIntegerEnv } from "./worker/delivery-worker-loop";

/** Spec 061 FR-004: compliance team address of the alerts e-mail (none: the center only). */
function complianceAlertEmail(): string | undefined {
  const value = process.env.ASSURMATCH_COMPLIANCE_ALERT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+$/.test(value) ? value : undefined;
}
import { DashboardsModule } from "../modules/dashboards/dashboards.module";
import { aiSurfaceSchema } from "../../../packages/shared/contracts/ai.contracts";
import type { BrokerOfferCoverageItem } from "../../../packages/shared/contracts/offer-content";
import { maybeBootstrapAdmin } from "./local-bootstrap-admin";
import { AdminOperationsModule } from "../modules/admin-operations/admin-operations.module";

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
  /** Spec 050 R9: regimes were in memory only although the Prisma model existed. */
  private readonly regulatoryRegimesRepository = this.runtimeRepository(new PrismaRegulatoryRegimesRepository(this.prisma));
  private readonly partnersRepository = this.runtimeRepository(new PrismaPartnersRepository(this.prisma));
  private readonly partnerLicensesRepository = this.runtimeRepository(new PrismaPartnerLicensesRepository(this.prisma));
  /** Spec 051 R5: accreditation documents were in memory only although the Prisma model existed. */
  private readonly accreditationDocumentsRepository = this.runtimeRepository(new PrismaAccreditationDocumentsRepository(this.prisma));
  private readonly consentRecordsRepository = this.runtimeRepository(new PrismaConsentRecordsRepository(this.prisma));
  private readonly notificationsRepository = this.runtimeRepository(new PrismaNotificationsRepository(this.prisma));
  private readonly usersRepository = this.runtimeRepository(new PrismaUsersRepository(this.prisma));
  private readonly partnerIntegrationsRepository = this.runtimeRepository(new PrismaPartnerIntegrationsRepository(this.prisma)) ?? new MemoryPartnerIntegrationsRepository();
  private readonly offersRepository = this.runtimeRepository(new PrismaOffersRepository(this.prisma));
  private readonly prospectsRepository = this.runtimeRepository(new PrismaProspectsRepository(this.prisma));
  private readonly quoteFormDefinitionsRepository = this.runtimeRepository(new PrismaQuoteFormDefinitionsRepository(this.prisma));
  private readonly quoteRequestsRepository = this.runtimeRepository(new PrismaQuoteRequestsRepository(this.prisma));
  /** Spec 054 R1: hashed visitor access tokens. */
  private readonly visitorAccessTokensRepository = this.runtimeRepository(new PrismaVisitorAccessTokensRepository(this.prisma));
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
  /** Spec 055: proposals and visitor responses (memory instance owned here under test, see spec 046 note). */
  private readonly leadProposalsRepository = this.runtimeRepository(new PrismaLeadProposalsRepository(this.prisma)) ?? new MemoryLeadProposalsRepository();
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
    },
    onEvent: async (eventType, partnerTenantId, data) => {
      if (eventType === "lead.status_changed") {
        await this.satisfactionSurveys?.trigger.onLeadStatusChanged({
          leadAssignmentId: String(data.leadAssignmentId),
          status: String(data.status),
          ...(typeof data.previousStatus === "string" ? { previousStatus: data.previousStatus } : {}),
          ...(partnerTenantId ? { partnerTenantId } : {})
        }).catch(() => undefined);
      }
      // Spec 054 R6: the visitor is told of every public step (accepted, reassigned, closed).
      await this.visitorQuoteNotifier?.onLeadEvent(eventType, partnerTenantId, data);
    }
  });
  readonly regulatoryRegimes: RegulatoryRegimesModule = new RegulatoryRegimesModule(
    this.audit.writer,
    this.regulatoryRegimesRepository,
    // R9: a regime referenced by a country cannot be retired; resolved lazily (countries come next).
    async (regimeId: string): Promise<string[]> => (await this.countries.service.listAdmin()).filter((country: Country) => country.regulatoryRegimeId === regimeId).map((country: Country) => country.isoCode)
  );
  readonly countries: CountriesModule = new CountriesModule(this.audit.writer, this.countriesRepository, {
    find: async (id: string): Promise<{ id: string; status: string } | undefined> => this.regulatoryRegimes.service.find(id)
  });
  readonly products = new ProductsModule(this.audit.writer, this.productsRepository);
  readonly partners = new PartnersModule(this.audit.writer, this.partnersRepository);
  readonly partnerLicenses = new PartnerLicensesModule(this.audit.writer, this.partnerLicensesRepository);
  /** Spec 051 R12: partner status per request (auth guard, login), invalidated on every partner change. */
  readonly partnerTenantStatus = new PartnerTenantStatusService(this.partners.service);
  /** Shared by uploads and by the retention anonymizer, which deletes the files (spec 046). */
  readonly documentStorage = resolveDocumentStorage();
  /** Spec 051 C6: one antivirus for quote documents and accreditation documents. */
  readonly virusScanner = resolveVirusScanner();
  /** Spec 051 R5: persisted accreditation documents, scanned synchronously, durable storage outside local/test. */
  readonly documents = new DocumentsModule(this.audit.writer, {
    storage: this.documentStorage,
    scanner: this.virusScanner,
    repository: this.accreditationDocumentsRepository,
    requireDurableStorage: process.env.APP_ENV === "production" || process.env.APP_ENV === "preproduction"
  });
  readonly users = new UsersModule(this.audit.writer, this.usersRepository);
  /** Spec 053 R6: stored status and roles of a broker user, read by the auth guard on every request. */
  readonly userAccessStatus = new UserAccessStatusService(this.users.service);
  readonly auth = new AuthModule(this.users.service, this.audit.writer, this.emailDelivery, this.partnerTenantStatus);
  readonly featureFlags = new FeatureFlagsModule(
    this.audit.writer,
    new FeatureFlagCacheService(this.redis.client),
    this.featureFlagRepository
  );
  readonly consent = new ConsentModule(this.audit.writer, this.consentRecordsRepository);
  /** Spec 050 US3: consent text administration (hash computed server side, preview resolved with catalogue names). */
  readonly consentTexts = new AdminConsentTextsController(this.consent.service, this.audit.writer, {
    countryName: async (countryId: string) => (await this.countries.service.require(countryId).catch(() => undefined))?.name,
    productName: async (productId: string) => (await this.products.service.require(productId).catch(() => undefined))?.name,
    countryExists: async (countryId: string) => Boolean(await this.countries.service.require(countryId).catch(() => undefined))
  });
  private readonly messagingRepository = this.runtimeRepository(new PrismaMessagingRepository(this.prisma)) ?? new MemoryMessagingRepository();
  readonly notifications = new NotificationsModule(this.audit.writer, this.queues.notifications, this.notificationsRepository, {
    smsProvider: process.env.ASSURMATCH_SMS_PROVIDER,
    smsSecretConfigured: Boolean(process.env.ASSURMATCH_SMS_API_KEY),
    whatsappProvider: process.env.ASSURMATCH_WHATSAPP_PROVIDER,
    whatsappSecretConfigured: Boolean(process.env.ASSURMATCH_WHATSAPP_API_KEY)
  }, this.featureFlags.service, this.messagingRepository, this.partnerWebhookEvents);
  readonly brokerNotifications = new BrokerNotificationsService({ audit: this.audit.writer, dispatch: this.notifications.dispatch });
  /** Spec 061 FR-002/FR-003: broker alerts (in-app always, pointer e-mail, opted-in SMS/WhatsApp). */
  readonly brokerAlerts = new BrokerAlertNotifier({
    notifications: this.notifications.service,
    dispatch: this.notifications.dispatch,
    audit: this.audit.writer,
    partnerPhone: async (partnerTenantId: string) => (await this.partners.service.require(partnerTenantId).catch(() => undefined))?.primaryWhatsApp
  });
  private readonly adminAlertsRepository = this.runtimeRepository(new PrismaAdminAlertsRepository(this.prisma)) ?? new MemoryAdminAlertsRepository();
  /** Spec 061: liveness of the spec 057 worker, written by the worker, read by the alerts center. */
  readonly workerHeartbeats = this.runtimeRepository(new PrismaWorkerHeartbeatRepository(this.prisma)) ?? new MemoryWorkerHeartbeatRepository();
  /** Spec 061 FR-004: admin alerts center (raise, list, acknowledge, compliance e-mail). */
  readonly adminAlerts = new AdminAlertsService({
    repository: this.adminAlertsRepository,
    heartbeats: this.workerHeartbeats,
    audit: this.audit.writer,
    notifications: this.notifications.service,
    complianceEmail: () => complianceAlertEmail(),
    workerStaleMinutes: () => readIntegerEnv(process.env, "ASSURMATCH_WORKER_STALE_MINUTES", 10, 1, 1440)
  });
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
  /** Spec 052: offer versions; the integrations are lazy (partners, licences, inbox, eligibility). */
  readonly offers: OffersModule = new OffersModule(this.audit.writer, this.redis.client, this.offersRepository, {
    partnerEligibility: (partnerTenantId: string, countryId: string, productId: string) => this.publicOfferPartnerEligibility(partnerTenantId, countryId, productId),
    coverage: (partnerTenantId: string, countryId: string, productId: string) => this.offerCoverageBlockers(partnerTenantId, countryId, productId),
    coverageCandidates: (partnerTenantId: string) => this.offerCoverageCandidates(partnerTenantId),
    partnerName: async (partnerTenantId: string) => {
      const partner = await this.partners.service.require(partnerTenantId).catch(() => undefined);
      return partner?.tradeName ?? partner?.legalName;
    },
    partnerStatus: async (partnerTenantId: string) => (await this.partners.service.require(partnerTenantId).catch(() => undefined))?.status,
    notifier: {
      publishInApp: (input) => this.notifications.dispatch.publishInApp(input),
      listInApp: (scopeId: string, limit?: number) => this.notifications.dispatch.listInApp(scopeId, limit)
    }
  });
  readonly scoringRules = new ScoringRulesService({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service,
    ...(this.scoringRulesRepository ? { repository: this.scoringRulesRepository } : {})
  });
  readonly quoteForms = new QuoteFormsModule(this.audit.writer, {
    // Spec 050 T007 (C4): the real purpose, language, scope and content reach the forms service, so
    // publication can check them and the public form can serve the resolved text.
    consentTexts: async () => (await this.consent.service.listTexts()).map((text) => ({
      id: text.id,
      version: text.version,
      contentHash: text.contentHash,
      purpose: text.purpose,
      recipientCategory: text.recipientCategory,
      status: text.status ?? "draft",
      language: text.language,
      countryId: text.countryId,
      productId: text.productId ?? null,
      channel: text.channel,
      content: text.content ?? null,
      ...(text.publishedAt ? { publishedAt: text.publishedAt } : {}),
      createdAt: text.createdAt
    })),
    // Spec 050 R5/R8: names for the consent variables and the country phone rule of the public form.
    formContext: async (countryId: string, productId: string) => {
      const [country, product] = await Promise.all([
        this.countries.service.require(countryId).catch(() => undefined),
        this.products.service.require(productId).catch(() => undefined)
      ]);
      return {
        ...(country ? { countryName: country.name } : {}),
        ...(product ? { productName: product.name } : {}),
        phoneRule: country?.phoneDialCode && country.phoneNationalLengths?.length
          ? { dialCode: country.phoneDialCode, nationalLengths: [...country.phoneNationalLengths] }
          : null
      };
    },
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
      multiBroker: { isEnabled: () => this.featureFlags.service.isEnabled("multi_broker_routing_enabled") },
      // Spec 051 R14: routing requires a persisted, accepted and clean accreditation document.
      accreditation: (partnerTenantId: string) => this.documents.service.hasAcceptedCleanForPartner(partnerTenantId),
      // Spec 055 FR-001: contact masked once the visitor withdrew consent (resolved lazily).
      quoteState: (quoteRequestId: string) => this.quoteRequests.submissions.findById(quoteRequestId),
      contact: (quoteRequestId: string) => this.consentedContact(quoteRequestId)
    }
  );
    readonly satisfactionSurveys: SatisfactionSurveysModule = new SatisfactionSurveysModule(
    {
      assignments: {
        find: (id: string) => this.leads.assignments.require(id).catch(() => undefined)
      },
      quotes: {
        findById: (id: string) => this.quoteRequestsRepository ? this.quoteRequestsRepository.findById(id) : this.quoteRequests.submissions.findById(id)
      },
      prospects: {
        find: (id: string) => this.prospects.service.require(id).catch(() => undefined)
      },
      consent: this.consent.service,
      countries: {
        findById: (id: string) => this.countries.service.require(id).catch(() => undefined)
      },
      products: {
        findById: (id: string) => this.products.service.require(id).catch(() => undefined)
      },
      emailDelivery: {
        sendAuthEmail: (payload) => this.emailDelivery.send(payload)
      },
      isFlagEnabled: (flag: string) => this.featureFlags.service.isEnabled(flag),
      complianceAlerts: {
        raise: async (alert) => {
          this.audit.writer.write({
            action: "satisfaction_survey.concern_flagged",
            targetType: "SatisfactionSurveyRequest",
            targetId: alert.publicReference,
            scope: { partnerTenantId: alert.partnerTenantId },
            result: "refused",
            reason: "broker_satisfaction_concern",
            context: alert
          });
        }
      }
    },
    this.audit.writer,
    this.redis.client,
    this.runtimeRepository(new PrismaSatisfactionSurveyRepository(this.prisma)),
    this.runtimeRepository(new PrismaNotificationUnsubscribeRepository(this.prisma))
  );

readonly enterprise = new EnterpriseService({
    audit: this.audit.writer,
    partners: this.partners.service,
    assignments: this.leads.assignments,
    ...(this.enterpriseRepository ? { repository: this.enterpriseRepository } : {})
  });
  readonly quoteRequests: QuoteRequestsModule = new QuoteRequestsModule({
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
    isGlobalFlagEnabled: (key) => this.featureFlags.service.isEnabled(key),
    satisfactionSurveys: { onConsentWithdrawn: (id: string) => this.satisfactionSurveys.service.onConsentWithdrawn(id) },
    // Spec 052 R7: the selected offer must be publicly visible here, with the catalogue's own rules.
    selectedOffers: { verify: (offerId: string, countryId: string, productId: string) => this.verifySelectedOffer(offerId, countryId, productId) },
    // Spec 054: hashed visitor tokens, the broker named to the visitor and the public timeline.
    ...(this.visitorAccessTokensRepository ? { visitorAccessTokens: this.visitorAccessTokensRepository } : {}),
    partnerName: (partnerTenantId: string) => this.partnerDisplayName(partnerTenantId),
    assignmentHistory: (leadAssignmentId: string) => this.leads.assignmentsRepository.historyForLead(leadAssignmentId),
    // Spec 055 FR-005: proposals of the request in the tracking space (resolved lazily).
    proposals: { forVisitorStatus: (quote, assignments, actor) => this.leadProposals.service.forVisitorStatus(quote, assignments, actor) }
  }, this.audit.writer, this.redis.client, this.quoteRequestsRepository);
  /** Spec 055: broker proposals, visitor follow-up and internal lead documents. */
  readonly leadProposals: LeadProposalsModule = new LeadProposalsModule({
    audit: this.audit.writer,
    repository: this.leadProposalsRepository,
    assignments: this.leads.assignments,
    crmAccess: this.leads.brokerCrmAccess,
    starterAccess: this.leads.brokerStarterAccess,
    crmPipeline: this.leads.brokerCrmPipeline,
    crmHistory: this.leads.brokerCrmHistory,
    leadHistory: this.leads.brokerStarterHistory,
    upload: {
      storage: this.documentStorage,
      scanner: this.virusScanner,
      requireDurableStorage: process.env.APP_ENV === "production" || process.env.APP_ENV === "preproduction"
    },
    quotes: { findById: (id: string) => this.quoteRequests.submissions.findById(id) },
    partnerName: async (partnerTenantId: string) => (await this.partnerDisplayName(partnerTenantId)) ?? "courtier partenaire",
    notifications: this.notifications.quoteService,
    visitorAccess: this.quoteRequests.submissions.visitorAccess,
    abuseGuard: this.quoteRequests.abuseGuard,
    redis: this.redis.client
  }, { crmActivity: this.leads.crmActivityRepository });
  /** Spec 054 R6: subscriber of the lead event bus that queues the visitor e-mails. */
  readonly visitorQuoteNotifier: VisitorQuoteNotifier = new VisitorQuoteNotifier({
    notifications: this.notifications.quoteService,
    assignments: this.leads.assignments,
    quotes: { findById: (id: string) => this.quoteRequests.submissions.findById(id) },
    audit: this.audit.writer
  });
  /** Spec 044: drains the quote notification backlog into the email delivery service. */
  readonly quoteNotificationDelivery = new QuoteNotificationDeliveryService({
    notifications: this.notifications.service,
    email: this.emailDelivery,
    templates: new QuoteEmailTemplateService(),
    audit: this.audit.writer,
    // The stored row keeps ids only, so the ISO code and product key are resolved from the catalogue.
    quotes: { findById: (id: string) => this.resolveQuoteScope(id) },
    prospects: { findById: (id: string) => this.prospects.service.require(id).catch(() => undefined) },
    partners: { findById: (id: string) => this.partners.service.require(id).catch(() => undefined) },
    // Spec 054 R2: a fresh visitor token is minted when the e-mail is rendered.
    visitorAccess: { issue: (quoteRequestId: string, context: { reason: string }) => this.quoteRequests.submissions.visitorAccess.issue(quoteRequestId, context) },
    complianceEmail: () => complianceAlertEmail()
  });
  readonly quoteDocuments = new QuoteDocumentsService({
    audit: this.audit.writer,
    storage: this.documentStorage,
    scanner: this.virusScanner,
    queue: this.queues.notifications,
    redis: this.redis.client,
    submissions: this.quoteRequests.submissions,
    countries: this.countries.service,
    products: this.products.service,
    assignments: this.leads.assignments,
    crmDocuments: this.leads.crmActivityRepository,
    notifications: this.notifications.service,
    brokerAlerts: this.brokerAlerts,
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
    // Spec 054 R6: internal `lead.reassigned`, consumed by the visitor notifier only.
    events: this.partnerWebhookEvents,
    notifyBroker: async (assignment, actor) => {
      const notificationId = await this.quoteRequests.submissions.notifyBrokerForAssignment(assignment, actor);
      // Spec 061 FR-003: the pointer e-mail and in-app entry come with the notification above;
      // SMS / WhatsApp only reach a tenant that opted in.
      if (notificationId) await this.brokerAlerts.optionalChannels({ partnerTenantId: assignment.partnerTenantId, type: "broker_lead_reassigned", title: "Lead reaffecte a votre cabinet" }, actor).catch(() => 0);
      await this.quoteDocuments.shareForAssignment(assignment.quoteRequestId, assignment);
      return notificationId;
    }
  });
  /** Spec 056: quote requests, persisted manual review, assignments, audit search, routing history. */
  readonly adminOperations = new AdminOperationsModule({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: { listAdmin: () => this.products.service.listAdmin() },
    partners: this.partners.service,
    submissions: this.quoteRequests.submissions,
    assignments: this.leads.assignments,
    decisions: this.leads.decisions,
    consent: { findRecord: (id: string) => this.consent.service.findRecord(id) },
    prospects: { find: (id: string) => this.prospects.service.require(id).catch(() => undefined) },
    offers: { find: (id: string) => this.offers.repository.require(id).catch(() => undefined) },
    documents: { list: async (actor, quoteRequestId) => (await this.quoteDocuments.adminList(actor, quoteRequestId)).items },
    eligibility: this.leads.eligibility,
    afterAssign: async (quoteRequestId, assignment) => {
      await this.quoteDocuments.shareForAssignment(quoteRequestId, assignment);
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
  /** Spec 051: partner onboarding and lifecycle behind the `/admin/partners` routes. */
  readonly partnerAdmin = new PartnerAdminService({
    audit: this.audit.writer,
    partners: this.partners.service,
    licenses: this.partnerLicenses.service,
    documents: this.documents.service,
    countries: this.countries.service,
    products: this.products.service,
    listUsers: () => this.users.service.list({ actorId: "system:partner-admin", roles: ["super_admin"], mfaVerified: true }),
    provisionUser: (actor, input) => this.adminUsersController().createPartnerUser(actor, input)
  });
  /** Spec 053 R3: broker requests (identity changes, coverage extensions) decided by the admin. */
  private readonly partnerChangeRequestsRepository = this.runtimeRepository(new PrismaPartnerChangeRequestsRepository(this.prisma)) ?? new MemoryPartnerChangeRequestsRepository();
  /** Spec 053: broker self-service (company profile, licences, coverage) behind `/broker/account` and `/broker/licenses`. */
  readonly brokerAccount = new BrokerAccountService({
    audit: this.audit.writer,
    partners: this.partners.service,
    licenses: this.partnerLicenses.service,
    documents: this.documents.service,
    catalog: {
      country: async (id: string) => {
        const country = await this.countries.service.require(id).catch(() => undefined);
        return country ? { id: country.id, name: country.name, isoCode: country.isoCode } : undefined;
      },
      product: async (id: string) => {
        const product = await this.products.service.require(id).catch(() => undefined);
        return product ? { id: product.id, name: product.name, key: product.key } : undefined;
      },
      choices: async () => ({
        countries: (await this.countries.service.listAdmin()).filter((country) => country.status !== "retired")
          .map((country) => ({ id: country.id, name: country.name, code: country.isoCode })).sort((left, right) => left.name.localeCompare(right.name)),
        products: (await this.products.service.listAdmin()).filter((product) => product.status !== "retired")
          .map((product) => ({ id: product.id, name: product.name, code: product.key })).sort((left, right) => left.name.localeCompare(right.name))
      })
    },
    requests: this.partnerChangeRequestsRepository
  });
  /** Spec 053 US3: the broker's own team behind `/broker/team`. */
  readonly brokerTeam = new BrokerTeamService({
    audit: this.audit.writer,
    users: this.users.service,
    provisionUser: (actor, input) => this.adminUsersController().createPartnerUser(actor, input),
    invalidateUserAccess: (userId: string) => this.userAccessStatus.invalidate(userId)
  });
  /** Spec 053 FR-004/FR-013: admin decisions on the broker requests (applied through `partnerAdmin`). */
  readonly partnerRequestAdmin = new PartnerRequestAdminService({
    audit: this.audit.writer,
    partners: this.partners.service,
    partnerAdmin: this.partnerAdmin,
    requests: this.partnerChangeRequestsRepository
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
    consent: this.consent.service,
    partnerReadiness: this.partnerAdmin
  });
  /** Spec 050: admin catalogue and controlled flag toggles; closes cached public reads on change. */
  readonly catalog = new CatalogModule({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service,
    regimes: this.regulatoryRegimes.service,
    featureFlags: this.featureFlags.service,
    checklist: this.activationChecklist.service,
    quoteForms: this.quoteForms.service,
    consent: this.consent.service,
    onCatalogChanged: () => this.publicCountryDirectory.invalidate()
  });
  readonly routingAnomalies = new RoutingAnomalyDetectorService({
    quoteRequests: {
      list: () => this.quoteRequests.submissions.list()
    },
    leadAssignments: {
      list: () => this.leads.assignments.list()
    },
    ...(this.routingRulesRepository ? { routingRules: { listRules: () => this.routingRulesRepository!.list() } } : {}),
    routingDecisions: {
      list: () => this.leads.decisions.list()
    },
    countries: {
      listAdmin: () => this.countries.service.listAdmin()
    },
    featureFlags: this.featureFlags.service,
    audit: this.audit.writer
  });
  readonly adminAi = new AdminAiService({
    audit: this.audit.writer,
    gateway: this.aiGateway,
    dashboard: this.dashboards.admin,
    complianceAlerts: this.dashboards.complianceAlerts,
    activationChecklist: this.activationChecklist.service,
    offers: this.offers.repository,
    quoteRequests: this.quoteRequests.submissions,
    routingAnomalyDetector: this.routingAnomalies
  });
  readonly adminRoutingAnomalies = new AdminRoutingAnomaliesController(this.routingAnomalies, this.adminAi);
  private readonly billingRepository = this.runtimeRepository(new PrismaBillingRepository(this.prisma));
  private readonly invoicingRepository = this.runtimeRepository(new PrismaInvoicingRepository(this.prisma));
  readonly billing = new BillingModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    partners: this.partners.service,
    assignments: this.leads.assignments,
    countries: this.countries.service,
    products: this.products.service,
    partnerLicenses: this.partnerLicenses.service,
    crmActivity: this.leads.crmActivityRepository,
    ...(this.billingRepository ? { repository: this.billingRepository } : {}),
    // Spec 060: invoice PDFs share the document storage; the broker is notified in-app.
    ...(this.invoicingRepository ? { invoicingRepository: this.invoicingRepository } : {}),
    documentStorage: this.documentStorage,
    inApp: this.notifications.dispatch
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
  /**
   * Spec 047: the confirmation sender for the three public forms. It shares `emailDelivery` with
   * the auth messages, so a deployment that has no SMTP configured keeps answering
   * `not_configured` instead of failing a submission.
   */
  readonly publicFormNotifications = new PublicFormNotificationService(this.emailDelivery);
  /**
   * Spec 061 FR-001: the `scheduled-alerts` task of the worker. Replaces the spec 052 R9 reminders
   * that were created when an offer list was read.
   */
  readonly scheduledAlerts = new ScheduledAlertsService({
    broker: this.brokerAlerts,
    admin: this.adminAlerts,
    config: readScheduledAlertsConfig(),
    sources: new RuntimeScheduledAlertSources({
      partners: this.partners.service,
      licenses: this.partnerLicenses.service,
      offers: {
        list: () => this.offers.repository.list(),
        versions: (offer) => this.offers.lifecycle.versions(offer as Parameters<OfferLifecycleService["versions"]>[0])
      },
      crm: this.leads.crmActivityRepository,
      assignments: {
        list: () => this.leads.assignments.list(),
        monthlyCountForPartner: (partnerTenantId: string, now: Date) => this.leads.assignmentsRepository.monthlyCountForPartner(partnerTenantId, now)
      },
      countries: this.countries.service,
      quotes: { list: () => this.quoteRequests.submissions.list() }
    })
  });
  /** Spec 045: public-site intake (waitlist, partner applications, contact) and public read models. */
  readonly waitlist = new WaitlistModule({
    findCountryByCode: (countryCode) => this.countries.service.findByIsoCode(countryCode),
    findProductByKey: (productKey) => this.products.service.findByKey(productKey),
    identity: this.prospects.identity,
    globalFlags: () => this.publicJourneyGlobalFlags(),
    notifications: this.publicFormNotifications
  }, this.audit.writer, this.redis.client, this.waitlistRepository);
  readonly partnerApplications = new PartnerApplicationsModule({
    findCountryByCode: (countryCode) => this.countries.service.findByIsoCode(countryCode),
    findProductByKey: (productKey) => this.products.service.findByKey(productKey),
    identity: this.prospects.identity,
    notifications: this.publicFormNotifications,
    // Spec 051 R10: conversion creates a draft partner and a draft licence; decisions are e-mailed.
    decisions: {
      partners: this.partners.service,
      licenses: this.partnerLicenses.service,
      findCountryById: (countryId: string) => this.countries.service.require(countryId).catch(() => undefined),
      notifications: this.publicFormNotifications
    }
  }, this.audit.writer, this.redis.client, this.partnerApplicationsRepository);
  readonly contactMessages = new ContactMessagesModule({
    findCountryByCode: (countryCode) => this.countries.service.findByIsoCode(countryCode),
    notifications: this.publicFormNotifications
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

  /**
   * The user administration entry point (`/admin/users` and the spec 051 partner invitation): the
   * existing activation path, plus the partner lookup that enforces R11.
   */
  adminUsersController(): AdminUsersController {
    return new AdminUsersController(this.users.service, this.audit.writer, this.auth.passwordReset, this.auth.userNotifications, {
      find: (id: string) => this.partners.service.find(id)
    });
  }

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
      ...(input.countryFlags ? { countryFlags: input.countryFlags } : { resolveCountryFlags: async (countryId: string) => publicCountryFlags(await this.countries.service.require(countryId)) }),
      ...(input.productFlags ? { productFlags: input.productFlags } : {
        // Spec 050 R2: an offer is read in its own country, so the link flags apply.
        resolveProductFlags: async (productId: string, countryId?: string) => {
          const product = await this.products.service.require(productId);
          return countryId ? this.products.service.effectiveFlags(product, countryId) : product.flags;
        }
      }),
      evaluatePartnerEligibility: (partnerTenantId, countryId, productId) => this.publicOfferPartnerEligibility(partnerTenantId, countryId, productId),
      resolvePartnerName: async (partnerTenantId) => {
        const partner = await this.partners.service.require(partnerTenantId).catch(() => undefined);
        return (partner as { tradeName?: string } | undefined)?.tradeName ?? partner?.legalName;
      },
      resolvePopularity: async (offerIds) => {
        const wanted = new Set(offerIds);
        const counts = new Map<string, number>();
        for (const quote of await this.quoteRequests.submissions.list()) {
          // Spec 052: an ignored (forged, expired, other scope) selection never counts as popularity.
          if (quote.selectedOfferOutcome === "ignored") continue;
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

  /** Spec 052 FR-007: blockers when the partner's authorisations and licence do not cover the scope. */
  async offerCoverageBlockers(partnerTenantId: string, countryId: string, productId: string): Promise<string[]> {
    const blockers: string[] = [];
    if (!await this.partners.service.isAuthorizedForCountry(partnerTenantId, countryId)) blockers.push("partner_country_not_authorized");
    if (!await this.partners.service.isAuthorizedForProduct(partnerTenantId, productId)) blockers.push("partner_product_not_authorized");
    if (!await this.partnerLicenses.service.eligible(partnerTenantId, countryId, productId)) blockers.push("license_not_valid_for_scope");
    return blockers;
  }

  /**
   * Spec 052 follow-up: candidate pairs for the broker coverage list = active country authorisations
   * x active product authorisations, whatever the country's public status (the offer is what lets a
   * country open). Retired countries, products and country-product links are left out; the licence
   * filter is applied by the caller through `offerCoverageBlockers`.
   */
  async offerCoverageCandidates(partnerTenantId: string): Promise<BrokerOfferCoverageItem[]> {
    const active = (rows: Array<{ scopeId: string; status: string }>) => [...new Set(rows.filter((row) => row.status === "active").map((row) => row.scopeId))];
    const countryIds = active(await this.partners.service.listAuthorizations(partnerTenantId, "country"));
    const productIds = active(await this.partners.service.listAuthorizations(partnerTenantId, "product"));
    const countries = (await Promise.all(countryIds.map((id) => this.countries.service.require(id).catch(() => undefined))))
      .filter((country): country is NonNullable<typeof country> => Boolean(country) && country?.status !== "retired");
    const products = (await Promise.all(productIds.map((id) => this.products.service.require(id).catch(() => undefined))))
      .filter((product): product is NonNullable<typeof product> => Boolean(product) && product?.status !== "retired");
    const items: BrokerOfferCoverageItem[] = [];
    for (const country of countries) {
      for (const product of products) {
        if (this.products.service.linkFor(product, country.id)?.status === "retired") continue;
        items.push({
          countryId: country.id,
          countryIsoCode: country.isoCode,
          countryName: country.name,
          productId: product.id,
          productKey: product.key,
          productName: product.name
        });
      }
    }
    return items;
  }

  /**
   * Spec 052 R7/R8: an offer selected by a visitor is accepted only when the public catalogue would
   * show it for this country and product right now (policy, flags, partner eligibility).
   */
  async verifySelectedOffer(offerId: string, countryId: string, productId: string): Promise<{ accepted: true; partnerTenantId?: string | undefined } | { accepted: false; reason: string }> {
    const country = await this.countries.service.require(countryId).catch(() => undefined);
    const product = await this.products.service.require(productId).catch(() => undefined);
    if (!country || !product) return { accepted: false, reason: "scope_unavailable" };
    const { offer, reasons } = await this.offers.publicCatalog.selectableOffer(offerId, countryId, productId, this.publicOfferContext({
      countryFlags: publicCountryFlags(country),
      productFlags: this.products.service.effectiveFlags(product, country.id)
    }));
    if (!offer) return { accepted: false, reason: reasons[0] ?? "offer_not_public" };
    return { accepted: true, ...(offer.partnerTenantId ? { partnerTenantId: offer.partnerTenantId } : {}) };
  }

  /** Spec 054: the name a visitor sees for a partner (trade name, else legal name). */
  async partnerDisplayName(partnerTenantId: string): Promise<string | undefined> {
    const partner = await this.partners.service.require(partnerTenantId).catch(() => undefined);
    return partner?.tradeName ?? partner?.legalName;
  }

  /** Spec 052 R8: broker named by the quote form when the selected offer is public and its broker eligible. */
  async selectedOfferPartnerName(offerId: string, countryId: string, productId: string): Promise<string | undefined> {
    const verdict = await this.verifySelectedOffer(offerId, countryId, productId);
    if (!verdict.accepted || !verdict.partnerTenantId) return undefined;
    const partner = await this.partners.service.require(verdict.partnerTenantId).catch(() => undefined);
    return partner?.tradeName ?? partner?.legalName;
  }

  runtimeRepositoryModes(): Record<string, string | undefined> {
    return {
      AuditLogRepository: this.auditLogRepository?.mode,
      FeatureFlagRepository: this.featureFlagRepository?.mode,
      CountriesRepository: this.countriesRepository?.mode,
      ProductsRepository: this.productsRepository?.mode,
      RegulatoryRegimesRepository: this.regulatoryRegimesRepository?.mode,
      OffersRepository: this.offersRepository?.mode,
      ProspectsRepository: this.prospectsRepository?.mode,
      QuoteFormDefinitionsRepository: this.quoteFormDefinitionsRepository?.mode,
      ConsentRecordsRepository: this.consentRecordsRepository?.mode,
      QuoteRequestsRepository: this.quoteRequestsRepository?.mode,
      VisitorAccessTokensRepository: this.visitorAccessTokensRepository?.mode,
      LeadAssignmentsRepository: this.leadRepositorySet.assignments?.mode,
      RoutingDecisionsRepository: this.leadRepositorySet.decisions?.mode,
      PartnersRepository: this.partnersRepository?.mode,
      PartnerLicensesRepository: this.partnerLicensesRepository?.mode,
      AccreditationDocumentsRepository: this.accreditationDocumentsRepository?.mode,
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

  /**
   * Spec 055 FR-001: the consented contact of a request (the Prisma assignment repository already
   * enriches its records with it; the memory one does not).
   */
  private async consentedContact(quoteRequestId: string): Promise<Record<string, unknown> | undefined> {
    const quote = await this.quoteRequests.submissions.findById(quoteRequestId).catch(() => undefined);
    if (!quote || quote.anonymizedAt) return undefined;
    const prospect = await this.prospects.service.require(quote.prospectId).catch(() => undefined);
    if (!prospect) return undefined;
    return {
      ...(prospect.displayName ? { displayName: prospect.displayName } : {}),
      ...(prospect.emailNormalized ? { email: prospect.emailNormalized } : {}),
      ...(prospect.phoneNormalized ? { phone: prospect.phoneNormalized } : {})
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
      leadProposals: this.leadProposalsRepository,
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
