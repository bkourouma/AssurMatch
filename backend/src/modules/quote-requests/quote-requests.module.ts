import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import type { ConsentService } from "../consent/consent.module";
import type { CountriesService } from "../countries/countries.module";
import type { QuoteAISummaryService } from "../ai/quote-summary/quote-ai-summary.service";
import type { QuoteRoutingService } from "../leads/quote-routing.service";
import type { QuoteNotificationService } from "../notifications/quote-notification.service";
import type { ProductsService } from "../products/products.module";
import type { ProspectIdentityService } from "../prospects/prospect-identity.service";
import type { ProspectsService } from "../prospects/prospects.service";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import { AdminQuoteRequestsController } from "./admin-quote-requests.controller";
import { PublicAntiSpamService } from "./public-anti-spam.service";
import { PublicQuoteRateLimitService } from "./public-quote-rate-limit.service";
import { PublicQuoteRequestsController } from "./public-quote-requests.controller";
import { PublicQuoteStatusController } from "./public-quote-status.controller";
import { QuoteDuplicateDetectionService } from "./quote-duplicate-detection.service";
import type { QuoteRequestsRepository } from "./quote-requests.repository";
import { QuoteSubmissionService, type QuoteAssignmentsPort, type QuoteInAppNotifierPort } from "./quote-submission.service";

export interface QuoteRequestsModuleDeps {
  countries: CountriesService;
  products: ProductsService;
  forms: QuoteFormDefinitionService;
  consent: ConsentService;
  identity: ProspectIdentityService;
  prospects: ProspectsService;
  routing?: QuoteRoutingService;
  notifications?: QuoteNotificationService;
  aiSummary?: QuoteAISummaryService;
  /** Spec 045: assignments closed when a visitor withdraws consent (`LeadAssignmentService`). */
  assignments?: QuoteAssignmentsPort;
  /** Spec 045: partner inbox used to tell a broker the withdrawn lead must not be worked (`MessagingDispatchService`). */
  inApp?: QuoteInAppNotifierPort;
  isGlobalFlagEnabled?: (key: string) => boolean;
}

export class QuoteRequestsModule {
  readonly rateLimit: PublicQuoteRateLimitService;
  readonly antiSpam: PublicAntiSpamService;
  readonly duplicate: QuoteDuplicateDetectionService;
  readonly abuseGuard: PublicAbuseGuardService;
  readonly submissions: QuoteSubmissionService;
  readonly publicController: PublicQuoteRequestsController;
  readonly statusController: PublicQuoteStatusController;
  readonly adminController: AdminQuoteRequestsController;

  constructor(deps: QuoteRequestsModuleDeps, audit = new AuditLogWriter(), redis: RedisClientPort = new InMemoryRedisClient(), repository?: QuoteRequestsRepository) {
    this.rateLimit = new PublicQuoteRateLimitService(redis);
    this.antiSpam = new PublicAntiSpamService(redis);
    this.duplicate = new QuoteDuplicateDetectionService(redis);
    this.abuseGuard = new PublicAbuseGuardService(redis);
    this.submissions = new QuoteSubmissionService({
      findCountryByCode: (countryCode) => deps.countries.findByIsoCode(countryCode),
      findProductByKey: (productKey) => deps.products.findByKey(productKey),
      forms: deps.forms,
      consent: deps.consent,
      identity: deps.identity,
      prospects: deps.prospects,
      rateLimit: this.rateLimit,
      antiSpam: this.antiSpam,
      duplicate: this.duplicate,
      abuseGuard: this.abuseGuard,
      ...(deps.assignments ? { assignments: deps.assignments } : {}),
      ...(deps.inApp ? { inApp: deps.inApp } : {}),
      ...(deps.isGlobalFlagEnabled ? { isGlobalFlagEnabled: deps.isGlobalFlagEnabled } : {}),
      ...(deps.routing ? { routing: deps.routing } : {}),
      ...(deps.notifications ? { notifications: deps.notifications } : {}),
      ...(deps.aiSummary ? { aiSummary: deps.aiSummary } : {})
    }, audit, repository);
    this.publicController = new PublicQuoteRequestsController(this.submissions);
    this.statusController = new PublicQuoteStatusController(this.submissions);
    this.adminController = new AdminQuoteRequestsController(this.submissions);
  }
}
