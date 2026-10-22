import { SatisfactionSurveysModule, PrismaSatisfactionSurveyRepository } from "../modules/satisfaction-surveys/satisfaction-surveys.module";
import { QuoteAISummaryService } from "../modules/ai/quote-summary/quote-ai-summary.service";
import { ActivationChecklistModule } from "../modules/activation-checklist/activation-checklist.module";
import { AIModule } from "../modules/ai/ai.module";
import { BillingModule } from "../modules/billing/billing.module";
import { PrismaBillingRepository } from "../modules/billing/billing.repository";
// Lot 5 (spec 071)
import { PrismaPlanChangeRequestsRepository } from "../modules/billing/plan-change-requests.repository";
import type { PartnerCommercialState } from "../modules/routing/routing-controls.ports";
// End Lot 5
import { PrismaInvoicingRepository } from "../modules/billing/invoicing.repository";
import { AuditLogsModule } from "../modules/audit-logs/audit-logs.module";
import { PrismaAuditLogRepository } from "../modules/audit-logs/audit-log-repository";
import { ConfigModule } from "../config/config.module";
import { PrismaService } from "../modules/common/prisma/prisma.service";
import { QueuesModule } from "../modules/common/queues/queues.module";
import { RedisModule } from "../modules/common/redis/redis.module";
import { ConsentModule } from "../modules/consent/consent.module";
import { AdminConsentTextsController } from "../modules/consent/admin-consent-texts.controller";
import { AdminConsentRecordsController } from "../modules/consent/admin-consent-records.controller";
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
import type { ActorContext } from "../modules/common/types";
import type { AdvisorAgencyPredicate } from "../modules/common/agency-scope";
import { EnterpriseService } from "../modules/enterprise/enterprise.service";
import { MemoryEnterpriseRepository, PrismaEnterpriseRepository } from "../modules/enterprise/enterprise.repository";
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
// Lot 1 (spec 067)
import { QuoteOptionsService } from "../modules/quote-requests/quote-options.service";
import { PublicJourneyFlagPolicy } from "../modules/feature-flags/public-journey-flag-policy";
import { PrismaRegulatoryRegimesRepository, RegulatoryRegimesModule } from "../modules/regulatory-regimes/regulatory-regimes.module";
import { CatalogModule } from "../modules/catalog/catalog.module";
import { RoutingModule } from "../modules/routing/routing.module";
import { AiGateway } from "../modules/ai/core/ai-gateway.service";
import { MemoryAiInteractionsRepository, PrismaAiInteractionsRepository } from "../modules/ai/core/ai-interactions.repository";
import { resolveAiProvider } from "../modules/ai/core/ai-provider.config";
import { VisitorAiService } from "../modules/ai/visitor-ai.service";
import { BrokerAiService } from "../modules/ai/broker-ai.service";
import type { PartnerPlan } from "../modules/ai/core/ai-gateway.service";
import { AdminAiService } from "../modules/ai/admin-ai.service";
import { AiScopeFlagPolicyService } from "../modules/ai/ai-scope-flags.service"; // Lot 7 (spec 074)
import { LeadReassignmentService } from "../modules/routing/lead-reassignment.service";
import { ManualRoutingService } from "../modules/routing/manual-routing.service";
import { PrismaRoutingRulesRepository } from "../modules/routing/routing-rules.repository";
import { RoutingRulesService } from "../modules/routing/routing-rules.service";
import { RoutingAnomalyDetectorService } from "../modules/routing/routing-anomaly-detector.service";
import { AdminRoutingAnomaliesController } from "../modules/routing/admin-routing-anomalies.controller";
import { SystemHealthModule } from "../modules/admin/system-health.module";
import { UsersModule } from "../modules/users/users.module";
import { PrismaUsersRepository } from "../modules/users/users.repository";
import { MemoryTrustedDevicesRepository, PrismaTrustedDevicesRepository } from "../modules/auth/trusted-devices.repository";
import { AuthModule } from "../modules/auth/auth.module";
import { RuntimeEmailDeliveryService } from "../modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../modules/notifications/quote-notification-delivery.service";
import { PublicFormNotificationService } from "../modules/notifications/public-form-notification.service";
import { PartnerEligibilityService } from "../modules/partners/partner-eligibility.service";
import { PartnerIntegrationsModule } from "../modules/partner-integrations/partner-integrations.module";
import { MemoryPartnerIntegrationsRepository, PrismaPartnerIntegrationsRepository } from "../modules/partner-integrations/partner-integrations.repository";
import { PartnerWebhookEventPublisher } from "../modules/partner-integrations/partner-webhook-event-publisher";
// Lot 10 (spec 076)
import { CrmConnectorModule, MemoryCrmConnectorRepository, PrismaCrmConnectorRepository } from "../modules/crm-connector/crm-connector.module";
import { resolveMessagingProviders } from "../modules/notifications/providers/messaging-provider-env";
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
// Lot 1 (spec 067)
import { VisitorDocumentReminderService } from "../modules/notifications/visitor-document-reminder.service";
import { PrismaLeadAssignmentsRepository } from "../modules/leads/lead-assignments.repository";
import { PrismaRoutingDecisionsRepository } from "../modules/leads/routing-decisions.repository";
import { PrismaCrmActivityRepository } from "../modules/leads/crm-activity.repository";
import { LeadProposalsModule, MemoryLeadProposalsRepository, PrismaLeadProposalsRepository } from "../modules/lead-proposals/lead-proposals.module";
// Spec 062 messaging
import { LeadMessagingModule, MemoryLeadMessagingRepository, PrismaLeadMessagingRepository } from "../modules/lead-messaging/lead-messaging.module";
import type { LeadMessagingNotificationsPort } from "../modules/lead-messaging/lead-messaging.ports";
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
// Spec 062 data requests
import { DataRequestsModule, MemoryDataRequestsRepository, PrismaDataRequestsRepository } from "../modules/data-requests/data-requests.module";
// Lot 9 (spec 072)
import { ContentCmsModule, MemoryContentCmsRepository, PrismaContentCmsRepository } from "../modules/content-cms/content-cms.module";
import type { DataRequestNotificationsPort } from "../modules/lead-messaging/lead-messaging.ports";
// Lot 4 (spec 070)
import { InsurersModule, MemoryInsurersRepository, PrismaInsurersRepository } from "../modules/insurers/insurers.module";
import { AdminProductCategoriesController } from "../modules/products/admin-product-categories.controller";
import { MemoryProductCategoriesRepository, PrismaProductCategoriesRepository } from "../modules/products/product-categories.repository";
import { ProductCategoriesService } from "../modules/products/product-categories.service";
import { MemoryProductVersionsRepository, PrismaProductVersionsRepository } from "../modules/products/product-versions.repository";
import { OfferAiSummaryController } from "../modules/offers/offer-ai-summary.controller";
import { OfferAiSummaryService } from "../modules/offers/offer-ai-summary.service";
import { ActivationAttestationsController } from "../modules/activation-checklist/activation-attestations.controller";
import { MemoryActivationAttestationsRepository, PrismaActivationAttestationsRepository } from "../modules/activation-checklist/activation-attestations.repository";
import { ActivationAttestationsService } from "../modules/activation-checklist/activation-attestations.service";
import { MemoryRoutingRulesRepository, type RoutingRulesRepository } from "../modules/routing/routing-rules.repository";
import { MemoryScoringRulesRepository, type ScoringRulesRepository } from "../modules/offers/scoring-rules.repository";
// End Lot 4 (spec 070)

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
  /** Spec 063: hashed tokens of the browsers a user trusts for 30 days. */
  private readonly trustedDevicesRepository = this.runtimeRepository(new PrismaTrustedDevicesRepository(this.prisma)) ?? new MemoryTrustedDevicesRepository();
  private readonly partnerIntegrationsRepository = this.runtimeRepository(new PrismaPartnerIntegrationsRepository(this.prisma)) ?? new MemoryPartnerIntegrationsRepository();
  private readonly offersRepository = this.runtimeRepository(new PrismaOffersRepository(this.prisma));
  private readonly prospectsRepository = this.runtimeRepository(new PrismaProspectsRepository(this.prisma));
  private readonly quoteFormDefinitionsRepository = this.runtimeRepository(new PrismaQuoteFormDefinitionsRepository(this.prisma));
  private readonly quoteRequestsRepository = this.runtimeRepository(new PrismaQuoteRequestsRepository(this.prisma));
  /** Spec 054 R1: hashed visitor access tokens. */
  private readonly visitorAccessTokensRepository = this.runtimeRepository(new PrismaVisitorAccessTokensRepository(this.prisma));
  private readonly routingRulesRepository = this.runtimeRepository(new PrismaRoutingRulesRepository(this.prisma));
  private readonly scoringRulesRepository = this.runtimeRepository(new PrismaScoringRulesRepository(this.prisma));
  // Lot 4 (spec 070): memory instances owned here under test, so the checklist reads the very rules the services hold.
  private readonly routingRulesStore: RoutingRulesRepository = this.routingRulesRepository ?? new MemoryRoutingRulesRepository();
  private readonly scoringRulesStore: ScoringRulesRepository = this.scoringRulesRepository ?? new MemoryScoringRulesRepository();
  private readonly productCategoriesRepository = this.runtimeRepository(new PrismaProductCategoriesRepository(this.prisma)) ?? new MemoryProductCategoriesRepository();
  private readonly productVersionsRepository = this.runtimeRepository(new PrismaProductVersionsRepository(this.prisma)) ?? new MemoryProductVersionsRepository();
  private readonly insurersRepository = this.runtimeRepository(new PrismaInsurersRepository(this.prisma)) ?? new MemoryInsurersRepository();
  private readonly activationAttestationsRepository = this.runtimeRepository(new PrismaActivationAttestationsRepository(this.prisma)) ?? new MemoryActivationAttestationsRepository();
  // End Lot 4 (spec 070)
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
  // Spec 062 messaging: messages, attachments and document requests (memory instance owned here under test, see spec 046 note).
  private readonly leadMessagingRepository = this.runtimeRepository(new PrismaLeadMessagingRepository(this.prisma)) ?? new MemoryLeadMessagingRepository();
  // Spec 062 data requests: visitor data-subject requests (memory instance owned here under test, see spec 046 note).
  private readonly dataRequestsRepository = this.runtimeRepository(new PrismaDataRequestsRepository(this.prisma)) ?? new MemoryDataRequestsRepository();
  // Lot 9 (spec 072): content CMS entries.
  private readonly contentCmsRepository = this.runtimeRepository(new PrismaContentCmsRepository(this.prisma)) ?? new MemoryContentCmsRepository();
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
      // Lot 10 (spec 076): generic outbound CRM connector (fail-safe, closed unless its flag is open).
      await this.crmConnector?.service.publish(eventType, partnerTenantId, data).catch(() => undefined);
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
  // Lot 4 (spec 070): categories and content versions; the author label comes from the user directory (lazy: users are built later).
  readonly products = new ProductsModule(this.audit.writer, this.productsRepository, {
    categories: this.productCategoriesRepository,
    versions: this.productVersionsRepository,
    resolveAuthorLabel: async (authorId: string) => (await this.users.service.require(authorId).catch(() => undefined))?.displayName
  });
  // End Lot 4 (spec 070)
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
  readonly auth = new AuthModule(this.users.service, this.audit.writer, this.emailDelivery, this.partnerTenantStatus, this.trustedDevicesRepository);
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
  /** Spec 059 follow-up: compliance consent-proof search (quote requests resolved lazily, built later). */
  readonly consentRecords = new AdminConsentRecordsController(this.consent.service, {
    quoteConsentIds: async (publicReference: string): Promise<string[] | undefined> => {
      const quote = await this.quoteRequests.submissions.findByPublicReference(publicReference);
      return quote ? [quote.consentRecordId, quote.surveyConsentRecordId].filter((id): id is string => Boolean(id)) : undefined;
    }
  });
  private readonly messagingRepository = this.runtimeRepository(new PrismaMessagingRepository(this.prisma)) ?? new MemoryMessagingRepository();
  // Lot 10 (spec 076): real SMS / WhatsApp adapters, built only from a complete environment configuration.
  private readonly messagingProviders = resolveMessagingProviders();
  readonly notifications = new NotificationsModule(this.audit.writer, this.queues.notifications, this.notificationsRepository, this.messagingProviders.config, this.featureFlags.service, this.messagingRepository, this.partnerWebhookEvents, {
    ...(this.messagingProviders.smsProvider ? { smsProvider: this.messagingProviders.smsProvider } : {}),
    ...(this.messagingProviders.whatsappProvider ? { whatsappProvider: this.messagingProviders.whatsappProvider } : {})
  });
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
  // Lot 12 (spec 077): an SMS/WhatsApp message that reaches dead_letter raises a critical admin alert (identifiers and counters only).
  private readonly channelDeadLetterAlert = this.notifications.dispatch.setDeadLetterHook((info) => {
    const isUuid = info.partnerTenantId !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(info.partnerTenantId);
    void this.adminAlerts.raise({
      type: "channel_dead_letter",
      severity: "critical",
      conditionKey: `channel_dead_letter:${info.channel}:${info.partnerTenantId ?? "global"}`,
      targetType: "ChannelOutbox",
      targetId: info.channel,
      ...(isUuid ? { partnerTenantId: info.partnerTenantId as string } : {}),
      details: { channel: info.channel, template: info.template, attempts: info.attempts, errorClass: info.errorClass }
    }).catch(() => undefined);
  });
  // Lot 3: shared with the scheduled alerts (broker first-action target), so the in-memory mode needs an explicit instance.
  private readonly enterpriseRepository = this.runtimeRepository(new PrismaEnterpriseRepository(this.prisma)) ?? new MemoryEnterpriseRepository();
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
    products: this.products.service,
    // Lot 2 (spec 068): the explainers read published offers only, through the public catalogue
    // visibility rules (lazy lambdas: `offers` and `publicOfferContext` are resolved at call time).
    formFields: {
      fields: async (countryId, productId, language) => {
        const published = (await this.quoteForms.service.list()).filter((form) => form.status === "published" && form.countryId === countryId && form.productId === productId);
        const form = published.find((candidate) => candidate.language === language) ?? published[0];
        return (form?.fields ?? []).map((field) => ({ key: field.key, label: field.label }));
      }
    },
    offers: {
      detail: async (offerId, countryId, productId) => {
        const context = await this.visitorAiOfferContext(countryId, productId);
        const { offer } = await this.offers.publicCatalog.selectableOffer(offerId, countryId, productId, context);
        if (!offer) throw new Error("Offer is not publicly available");
        return this.offers.publicCatalog.detail(offerId, undefined, context);
      },
      compare: async (offerIds, countryId, productId) => {
        const context = await this.visitorAiOfferContext(countryId, productId);
        for (const offerId of offerIds) {
          const { offer } = await this.offers.publicCatalog.selectableOffer(offerId, countryId, productId, context);
          if (!offer) throw new Error("Offer is not publicly available");
        }
        return this.offers.publicCatalog.compare({ ids: offerIds.join(",") }, undefined, context);
      }
    }
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
  // Lot 4 (spec 070): insurer referential (offers link to it through `OfferIntegrations.insurer`).
  readonly insurers = new InsurersModule(this.audit.writer, this.insurersRepository);
  // End Lot 4 (spec 070)
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
    // Lot 4 (spec 070)
    insurer: (insurerId: string) => this.insurers.service.resolve(insurerId),
    // End Lot 4 (spec 070)
    notifier: {
      publishInApp: (input) => this.notifications.dispatch.publishInApp(input),
      listInApp: (scopeId: string, limit?: number) => this.notifications.dispatch.listInApp(scopeId, limit)
    }
  });
  readonly scoringRules = new ScoringRulesService({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service,
    // Lot 4 (spec 070)
    repository: this.scoringRulesStore
    // End Lot 4 (spec 070)
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
    // Lot 4 (spec 070)
    repository: this.routingRulesStore
    // End Lot 4 (spec 070)
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
      contact: (quoteRequestId: string) => this.consentedContact(quoteRequestId),
      // Spec 063: lead disputes (country scopes of the finance admin, `billing_enabled` gate).
      disputes: { countries: this.countries.service, featureFlags: this.featureFlags.service },
      // Spec 064: Enterprise agency display filter; the enterprise service is built after the leads, hence the lazy call.
      agencyScope: { resolve: (actor: ActorContext, agencyId: string | undefined): Promise<AdvisorAgencyPredicate | undefined> => this.enterprise.agencyScopeFor(actor, agencyId) },
      // Lot 5 (spec 071): routing controls 9-12, quota lock and AI-assisted mode (the billing module is built later, hence the lazy calls).
      commercialState: (partnerTenantId: string): Promise<PartnerCommercialState> => this.billing.subscriptions.commercialState(partnerTenantId),
      leadQuality: { threshold: readIntegerEnv(process.env, "ASSURMATCH_ROUTING_LEAD_QUALITY_MIN_SCORE", 30, 0, 100) },
      aiRouting: { isEnabled: () => this.featureFlags.service.isEnabled("ai_assisted_routing_enabled") },
      redis: this.redis.client,
      requireRecordedContract: process.env.ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT === "true"
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
    users: this.users.service,
    repository: this.enterpriseRepository
  });
  /** Spec 064: custom role of a broker member, read by the auth guard on every request (cached 10 s, invalidated on change). */
  readonly customRoleAccess = this.enterprise.customRoleAccess;
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
    proposals: { forVisitorStatus: (quote, assignments, actor) => this.leadProposals.service.forVisitorStatus(quote, assignments, actor) },
    // Spec 062 messaging: flag + unread broker messages in the tracking status (resolved lazily).
    messaging: { summaryForVisitorStatus: (quote) => this.leadMessaging.service.summaryForVisitorStatus(quote) },
    // Lot 1 (spec 067) COMP-009: several offers need the flag open (re-checked by routing) and the visitor's consent.
    isMultiBrokerEnabled: () => this.featureFlags.service.isEnabled("multi_broker_routing_enabled"),
    // Lot 1 (spec 067) H2: a broker chosen directly must be eligible for the country and product.
    brokerChoice: { isEligible: async (partnerTenantId: string, countryId: string, productId: string) => (await this.leads.eligibility.evaluate(partnerTenantId, countryId, productId).catch(() => undefined))?.eligible === true }
  }, this.audit.writer, this.redis.client, this.quoteRequestsRepository);
  /** Lot 1 (spec 067): public options of the quote form (multi-broker availability, documents step, eligible brokers). */
  readonly quoteOptions: QuoteOptionsService = new QuoteOptionsService({
    findCountryByCode: (isoCode) => this.countries.service.findByIsoCode(isoCode),
    findProductByKey: (productKey) => this.products.service.findByKey(productKey),
    isMultiBrokerEnabled: () => this.featureFlags.service.isEnabled("multi_broker_routing_enabled"),
    documentUploadEnabled: (countryId, productId) => this.documentUploadEnabledFor(countryId, productId),
    verifyOffer: (offerId, countryId, productId) => this.verifySelectedOffer(offerId, countryId, productId),
    partnerName: (partnerTenantId) => this.partnerDisplayName(partnerTenantId),
    eligibleBrokers: async (countryId, productId) => (await this.leads.eligibility.candidates(countryId, productId))
      .filter((candidate) => candidate.eligible)
      .map((candidate) => ({ id: candidate.partner.id, displayName: candidate.partner.tradeName ?? candidate.partner.legalName })),
    quoteJourneyOpen: (country, product) => {
      const scoped = this.products.service.forCountry(product, country.id);
      const state = new PublicJourneyFlagPolicy().resolve({
        globalFlags: this.publicJourneyGlobalFlags(),
        countryFlags: publicCountryFlags(country),
        productFlags: scoped.flags,
        requireProductFlags: true
      });
      return state.quoteEnabled && scoped.status !== "suspended" && scoped.status !== "retired";
    }
  });
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
    complianceEmail: () => complianceAlertEmail(),
    // Lot 1 (spec 067): the document reminder carries a signed unsubscribe link and honours the opt-out.
    reminderUnsubscribe: this.satisfactionSurveys.unsubscribe
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
  // Spec 062 messaging: broker <-> visitor messaging and document requests (E-03, E-05).
  readonly leadMessaging: LeadMessagingModule = new LeadMessagingModule({
    audit: this.audit.writer,
    repository: this.leadMessagingRepository,
    assignments: this.leads.assignments,
    crmAccess: this.leads.brokerCrmAccess,
    starterAccess: this.leads.brokerStarterAccess,
    upload: {
      storage: this.documentStorage,
      scanner: this.virusScanner,
      requireDurableStorage: process.env.APP_ENV === "production" || process.env.APP_ENV === "preproduction"
    },
    quotes: { findById: (id: string) => this.quoteRequests.submissions.findById(id) },
    partnerName: async (partnerTenantId: string) => (await this.partnerDisplayName(partnerTenantId)) ?? "courtier partenaire",
    notifications: this.leadMessagingNotifications(),
    firstVisibleReply: this.leads.assignments,
    visitorAccess: this.quoteRequests.submissions.visitorAccess,
    abuseGuard: this.quoteRequests.abuseGuard,
    redis: this.redis.client,
    // On unless an operator switched it off: a missing flag row reads as enabled (writes only, reads stay open).
    isMessagingEnabled: () => this.featureFlags.service.isEnabled("broker_visitor_messaging_enabled")
  }, {
    documents: this.quoteDocuments,
    quotes: { findById: (id: string) => this.quoteRequests.submissions.findById(id) },
    visitorAccess: this.quoteRequests.submissions.visitorAccess
  });
  /** Lot 1 (spec 067, PRD §23): single J+3 reminder of a document request left open (worker task `document-reminders`). */
  readonly documentReminders = new VisitorDocumentReminderService({
    requests: this.leadMessagingRepository,
    quotes: { findById: (id: string) => this.quoteRequests.submissions.findById(id) },
    prospects: { findById: (id: string) => this.prospects.service.require(id).catch(() => undefined) },
    assignments: { findById: (id: string) => this.leads.assignments.require(id).catch(() => undefined) },
    notifications: this.notifications.quoteService,
    unsubscribe: this.satisfactionSurveys.unsubscribe
  });
  readonly brokerAi = new BrokerAiService({
    audit: this.audit.writer,
    gateway: this.aiGateway,
    featureFlags: this.featureFlags.service,
    crmLeads: this.leads.brokerCrmLeads,
    assignments: this.leads.assignments,
    access: this.leads.brokerCrmAccess,
    countries: this.countries.service,
    products: this.products.service,
    // Lot 3 (spec 069 FR-004) begin: bounded dashboard aggregates (no PII) and the plan/status of a tenant for system callers.
    performanceInput: async (actor, query) => {
      const windowDays = Math.min(365, Math.max(1, Number(query.windowDays) || 30));
      const now = new Date();
      const dashboard = await this.dashboards.broker.dashboard(actor, { from: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() });
      // Per-advisor ids are left out: the model only needs the tenant-level counters.
      const crm = dashboard.crm ? Object.fromEntries(Object.entries(dashboard.crm).filter(([key]) => key !== "byAssignedAdvisor")) : undefined;
      return { starter: dashboard.starter, ...(crm ? { crm } : {}) };
    },
    partnerProfile: async (partnerTenantId: string) => {
      const partner = await this.partners.service.require(partnerTenantId).catch(() => undefined);
      return partner ? { plan: partner.plan as PartnerPlan, status: partner.status } : undefined;
    }
    // Lot 3 end
  });
  readonly manualRouting = new ManualRoutingService({
    audit: this.audit.writer,
    // Lot 5 (spec 071): the queue shows the AI suggestion / quality score, and validation is audited.
    decisions: this.leads.decisions,
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
    // Spec 062: the previous broker's open document requests are cancelled at once (reads also close them lazily).
    onReassigned: (assignmentId, _previousPartnerTenantId, actor) => this.leadMessaging.documentRequests.closeForAssignment(assignmentId, "reassigned", actor),
    notifyBroker: async (assignment, actor) => {
      const notificationId = await this.quoteRequests.submissions.notifyBrokerForAssignment(assignment, actor);
      // Spec 061 FR-003: the pointer e-mail and in-app entry come with the notification above;
      // SMS / WhatsApp only reach a tenant that opted in.
      if (notificationId) await this.brokerAlerts.optionalChannels({ partnerTenantId: assignment.partnerTenantId, type: "broker_lead_reassigned", title: "Lead réaffecté à votre cabinet" }, actor).catch(() => 0);
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
    brokerCrmConfig: this.brokerCrmConfig,
    // Spec 064: Enterprise agency display filter (lazy: the enterprise service is built after this module).
    agencyScope: { resolve: (actor: ActorContext, agencyId: string | undefined): Promise<AdvisorAgencyPredicate | undefined> => this.enterprise.agencyScopeFor(actor, agencyId) },
    // Lot 3 (spec 069 FR-001/FR-003) begin: billing tariff for the estimated lead cost, agencies of the tenant, spec 055 proposals.
    leadPricing: async (plan, countryCode) => {
      const prices = await this.billing.plans.list({ actorId: "system:broker-dashboard", roles: ["super_admin"], mfaVerified: true });
      // No fallback on another country's tariff (wrong currency): a lead of a country without tariff has no estimated cost.
      const match = prices.find((price) => price.plan === plan && price.countryCode === countryCode);
      return match && match.perLeadPrice > 0 ? { perLeadPrice: match.perLeadPrice, sharedLeadPriceMultiplier: match.sharedLeadPriceMultiplier, currency: match.currency } : undefined;
    },
    agencies: {
      listForTenant: async (actor: ActorContext) => (await this.enterprise.listAgencies(actor)).map((agency) => ({ id: agency.id, name: agency.name, memberIds: agency.memberIds }))
    },
    quotesSent: async (assignmentId: string) => (await this.leadProposalsRepository.listForAssignment(assignmentId)).filter((proposal) => proposal.status !== "withdrawn").length
    // Lot 3 end
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
  // Lot 3 (spec 069 FR-004/FR-006) begin: late links (the AI service and the user directory depend on, or come after, the CRM services).
  private readonly crmLateLinks = (() => {
    // Approved AI priority scores of the actor's own CRM perimeter (empty when the flag, opt-out or plan closes scoring).
    this.leads.brokerCrmLeads.setPriorityScoreSource((actor) => this.brokerAi.priorityScoreMapFor(actor));
    // The advisor of an assignment is resolved from the user directory, never from the client-asserted tenant.
    this.leads.brokerCrmActivity.setAdvisorTenantResolver(async (advisorId) => {
      const user = await this.users.service.require(advisorId).catch(() => undefined);
      return user ? { partnerTenantId: user.partnerTenantId, status: user.status } : undefined;
    });
    return true;
  })();
  // Lot 3 end
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
    // Lot 4 (spec 070): manual attestations and the computed routing / scoring rule controls (PRD 35/36).
    attestations: this.activationAttestationsRepository,
    routingRules: { listRules: () => this.routingRulesStore.list() },
    scoringRules: { listRules: () => this.scoringRulesStore.list() },
    // End Lot 4 (spec 070)
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
  // Lot 4 (spec 070): admin product categories, offer AI summary (closed by default) and activation attestations.
  readonly productCategories = new ProductCategoriesService(this.audit.writer, { list: (countryId?: string) => this.products.service.listAdmin(countryId) }, this.productCategoriesRepository);
  readonly adminProductCategories = new AdminProductCategoriesController(this.productCategories, this.audit.writer);
  readonly offerAiSummary = new OfferAiSummaryController(new OfferAiSummaryService({
    offers: this.offers.repository,
    gateway: this.aiGateway,
    audit: this.audit.writer,
    scopeFlags: async (offer) => {
      const [country, product] = await Promise.all([
        this.countries.service.require(offer.countryId).catch(() => undefined),
        this.products.service.require(offer.productId).catch(() => undefined)
      ]);
      return {
        countryId: offer.countryId,
        productId: offer.productId,
        // A missing country or product closes the summary (an absent flag is not true).
        countryFlags: country ? { ...publicCountryFlags(country) } : { country_ai_enabled: false },
        productFlags: product ? { ...this.products.service.effectiveFlags(product, offer.countryId) } : {}
      };
    }
  }));
  readonly activationAttestations = new ActivationAttestationsController(new ActivationAttestationsService({
    repository: this.activationAttestationsRepository,
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service
  }));
  // End Lot 4 (spec 070)
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
  /** Lot 7 (spec 074): the audited, protected path for the country and product AI flags; closes cached public reads on change. */
  readonly aiScopeFlags = new AiScopeFlagPolicyService({
    audit: this.audit.writer,
    countries: this.countries.service,
    products: this.products.service,
    featureFlags: this.featureFlags.service,
    onChanged: () => this.publicCountryDirectory.invalidate()
  });
  private readonly billingRepository = this.runtimeRepository(new PrismaBillingRepository(this.prisma));
  private readonly invoicingRepository = this.runtimeRepository(new PrismaInvoicingRepository(this.prisma));
  // Lot 5 (spec 071)
  private readonly planChangeRepository = this.runtimeRepository(new PrismaPlanChangeRequestsRepository(this.prisma));
  // End Lot 5
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
    inApp: this.notifications.dispatch,
    // Lot 5 (spec 071): G-06 plan change requests and the non-duplicate billing criterion.
    ...(this.planChangeRepository ? { planChangeRepository: this.planChangeRepository } : {}),
    quoteDuplicates: async (quoteRequestIds: string[]) => {
      const blocked = new Set<string>();
      for (const id of quoteRequestIds) {
        const quote = this.quoteRequestsRepository ? await this.quoteRequestsRepository.findById(id) : await this.quoteRequests.submissions.findById(id);
        const record = quote as { duplicateStatus?: string; status?: string } | undefined;
        if (record?.duplicateStatus === "blocked_duplicate" || record?.status === "duplicate") blocked.add(id);
      }
      return blocked;
    }
    // End Lot 5
  });
  // Spec 063 (start): the dispute service credits through the invoicing service and notifies through the broker alerts.
  private readonly leadDisputesBound = this.bindLeadDisputes();
  private bindLeadDisputes(): true {
    this.leads.disputes.bindCredit({
      creditAcceptedDispute: (request, actor) => this.billing.invoicing.creditAcceptedDispute(request, actor),
      creditNoteNumber: (id) => this.billing.invoicing.creditNoteNumber(id),
      existingCredit: (disputeId, partnerId) => this.billing.invoicing.existingDisputeCredit(disputeId, partnerId),
      refreshDraft: async (partnerId, periodFrom, actor) => {
        await this.billing.drafts.refreshDraftForPeriod(partnerId, periodFrom, actor, "dispute_credit");
      }
    });
    this.leads.disputes.bindNotifier({
      notifyDecision: async (dispute) => {
        // In-app + pointer e-mail; neither carries lead content. The dedupe key makes a replay silent.
        await this.brokerAlerts.notify({
          partnerTenantId: dispute.partnerTenantId,
          type: "broker_dispute_decided",
          dedupeKey: `broker_dispute_decided:${dispute.id}`,
          inAppTemplate: "dispute_decided",
          title: "Décision sur votre contestation",
          body: "Une décision est disponible dans Facturation > Contestations.",
          targetType: "LeadDispute",
          targetId: dispute.id
        });
      }
    });
    return true;
  }
  // Spec 063 (end)
  readonly partnerIntegrations = new PartnerIntegrationsModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    partners: this.partners.service,
    assignments: this.leads.assignments,
    notifications: this.notifications.service,
    webhookDeliveryEnabled: process.env.ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED === "true",
    ...(this.partnerIntegrationsRepository ? { repository: this.partnerIntegrationsRepository } : {})
  });
  // Lot 10 (spec 076): generic outbound CRM connector, reuses the partner webhook origin allow-list.
  private readonly crmConnectorRepository = this.runtimeRepository(new PrismaCrmConnectorRepository(this.prisma)) ?? new MemoryCrmConnectorRepository();
  readonly crmConnector = new CrmConnectorModule({
    audit: this.audit.writer,
    featureFlags: this.featureFlags.service,
    partners: this.partners.service,
    repository: this.crmConnectorRepository,
    approvedOrigin: async (partnerTenantId: string, url: URL) => (await this.partnerIntegrationsRepository.listAllowlistEntries())
      .filter((entry) => entry.partnerTenantId === partnerTenantId && entry.status === "active")
      .some((entry) => entry.origin === url.origin && (!entry.path || entry.path === url.pathname)),
    deliveryEnabled: () => process.env.ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED === "true"
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
      quotes: { list: () => this.quoteRequests.submissions.list() },
      // Lot 3 (spec 069 D1): the broker's own first-action target (read lazily, minimum with the contractual one).
      branding: { listBranding: () => this.enterpriseRepository.listBranding() }
    }),
    // Lot 3 (spec 069 FR-008, D4): weekly AI summary, flag closed by default; the text comes from the central AI gateway.
    // The persisted dedupe key is tested before the gateway is called (one AI call per tenant and ISO week).
    hasBeenSent: async (dedupeKey) => (await this.notifications.service.findByDedupeKey(dedupeKey)) !== undefined,
    isWeeklySummaryEnabled: () => this.featureFlags.service.isEnabled("broker_weekly_ai_summary_enabled"),
    composeWeeklySummary: (partnerTenantId, stats) => this.brokerAi.weeklySummaryText(partnerTenantId, { ...stats })
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
  // Spec 062 data requests: access / rectification / erasure requests of the visitor and their compliance workflow.
  readonly dataRequests: DataRequestsModule = new DataRequestsModule({
    audit: this.audit.writer,
    repository: this.dataRequestsRepository,
    quotes: { findById: (id: string) => this.quoteRequests.submissions.findById(id) },
    visitorAccess: this.quoteRequests.submissions.visitorAccess,
    abuseGuard: this.quoteRequests.abuseGuard,
    redis: this.redis.client,
    notifications: this.dataRequestNotifications(),
    retention: this.dataRetention.service
  });
  // Lot 9 (spec 072): minimal CMS of the Content Admin role (admin editing, public reading of published content).
  readonly contentCms: ContentCmsModule = new ContentCmsModule({
    audit: this.audit.writer,
    repository: this.contentCmsRepository
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
    // Lot 8 (FR-B1): last chance for audit entries waiting in the outbox, before the pool closes.
    await this.audit.writer.drain();
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
      // Spec 052: an ignored (forged, expired, other scope) selection never counts as popularity.
      // Spec 059 follow-up: counted in the database instead of loading every quote request.
      resolvePopularity: (offerIds) => this.quoteRequests.submissions.countSelectedOffers(offerIds),
      resolveScoringWeights: (countryId, productId) => this.scoringRules.resolveWeights(countryId, productId)
    };
  }

  /** Lot 2 (spec 068): visibility context of the visitor offer explainers, scoped to one country and product. */
  private async visitorAiOfferContext(countryId: string, productId: string): Promise<PublicOfferVisibilityContext> {
    const country = await this.countries.service.require(countryId);
    const product = await this.products.service.require(productId);
    return this.publicOfferContext({ countryFlags: publicCountryFlags(country), productFlags: this.products.service.effectiveFlags(product, country.id) });
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

  /**
   * Lot 1 (spec 067): same rule as the quote-documents upload gate (global quote flag, country and
   * product quote flags, product document upload flag), read before a request exists.
   */
  async documentUploadEnabledFor(countryId: string, productId: string): Promise<boolean> {
    const [country, product] = await Promise.all([
      this.countries.service.require(countryId).catch(() => undefined),
      this.products.service.require(productId).catch(() => undefined)
    ]);
    if (!country || !product) return false;
    const flags = this.products.service.effectiveFlags(product, country.id);
    return this.featureFlags.service.isEnabled("quote_request_enabled")
      && publicCountryFlags(country).country_quote_enabled === true
      && flags.product_quote_enabled === true
      && flags.product_document_upload_enabled === true;
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
      CrmConnectorRepository: this.crmConnectorRepository?.mode, // Lot 10
      WaitlistRepository: this.waitlistRepository?.mode,
      PartnerApplicationsRepository: this.partnerApplicationsRepository?.mode,
      ContactMessagesRepository: this.contactMessagesRepository?.mode,
      // Lot 4 (spec 070)
      ProductCategoriesRepository: this.productCategoriesRepository.mode,
      ProductVersionsRepository: this.productVersionsRepository.mode,
      InsurersRepository: this.insurersRepository.mode,
      ActivationAttestationsRepository: this.activationAttestationsRepository.mode,
      RoutingRulesRepository: this.routingRulesStore.mode,
      ScoringRulesRepository: this.scoringRulesStore.mode,
      // End Lot 4 (spec 070)
      DataRetentionRepository: this.dataRetentionRepository?.mode,
      RetentionSubjectsRepository: this.retentionSubjectsRepository?.mode,
      // Spec 062 messaging
      LeadMessagingRepository: this.leadMessagingRepository.mode,
      // Spec 062 data requests
      DataRequestsRepository: this.dataRequestsRepository.mode,
      // Lot 9 (spec 072)
      ContentCmsRepository: this.contentCmsRepository.mode
    };
  }

  /**
   * Spec 062 data requests: acknowledgement and closure e-mails come from `QuoteNotificationService`;
   * the compliance alert is an admin alert (alerts center entry + compliance pointer e-mail), raised once per request.
   */
  private dataRequestNotifications(): DataRequestNotificationsPort {
    const quoteService = this.notifications.quoteService;
    return {
      queueVisitorAcknowledgement: (quote, event, actor) => quoteService.queueVisitorAcknowledgement(quote, event, actor),
      queueVisitorClosure: (quote, event, actor) => quoteService.queueVisitorClosure(quote, event, actor),
      queueComplianceAlert: (event) => this.adminAlerts.raise({
        type: "data_request_received",
        severity: "warning",
        conditionKey: `data_request_received:${event.dataRequestId}`,
        targetType: "DataRequest",
        targetId: event.dataRequestId,
        dedupe: "once",
        details: { reference: event.reference, requestType: event.requestType }
      })
    };
  }

  /**
   * Spec 062 messaging: the notification port of the messaging services. The pointer notifications
   * come from `QuoteNotificationService`; for the broker side the optional SMS / WhatsApp channels
   * are triggered after it, like a reassigned lead (spec 061 FR-003).
   */
  private leadMessagingNotifications(): LeadMessagingNotificationsPort {
    const quoteService = this.notifications.quoteService;
    return {
      queueVisitorBrokerMessage: (quote, event, actor) => quoteService.queueVisitorBrokerMessage(quote, event, actor),
      queueVisitorDocumentsRequested: (quote, event, actor) => quoteService.queueVisitorDocumentsRequested(quote, event, actor),
      // The optional channels follow the pointer notification: a coalesced repeat (nothing queued) sends no SMS / WhatsApp.
      queueBrokerVisitorMessage: async (quote, event, actor) => {
        const result = await quoteService.queueBrokerVisitorMessage(quote, event, actor);
        if (result) await this.brokerAlerts.optionalChannels({ partnerTenantId: event.partnerTenantId, type: "broker_visitor_message", title: "Nouveau message d'un visiteur" }, actor).catch(() => 0);
        return result;
      },
      queueBrokerDocumentReceived: async (quote, event, actor) => {
        const result = await quoteService.queueBrokerDocumentReceived(quote, event, actor);
        if (result) await this.brokerAlerts.optionalChannels({ partnerTenantId: event.partnerTenantId, type: "broker_document_received", title: "Un document a été reçu" }, actor).catch(() => 0);
        return result;
      }
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
      // Spec 062: messages / attachments / document requests, and the data requests registry.
      leadMessaging: this.leadMessagingRepository,
      dataRequests: this.dataRequestsRepository,
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
