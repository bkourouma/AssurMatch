import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
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
import { QuoteSubmissionService } from "./quote-submission.service";

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
}

export class QuoteRequestsModule {
  readonly rateLimit: PublicQuoteRateLimitService;
  readonly antiSpam: PublicAntiSpamService;
  readonly duplicate: QuoteDuplicateDetectionService;
  readonly submissions: QuoteSubmissionService;
  readonly publicController: PublicQuoteRequestsController;
  readonly statusController: PublicQuoteStatusController;
  readonly adminController: AdminQuoteRequestsController;

  constructor(deps: QuoteRequestsModuleDeps, audit = new AuditLogWriter(), redis: RedisClientPort = new InMemoryRedisClient()) {
    this.rateLimit = new PublicQuoteRateLimitService(redis);
    this.antiSpam = new PublicAntiSpamService(redis);
    this.duplicate = new QuoteDuplicateDetectionService(redis);
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
      ...(deps.routing ? { routing: deps.routing } : {}),
      ...(deps.notifications ? { notifications: deps.notifications } : {}),
      ...(deps.aiSummary ? { aiSummary: deps.aiSummary } : {})
    }, audit);
    this.publicController = new PublicQuoteRequestsController(this.submissions);
    this.statusController = new PublicQuoteStatusController(this.submissions);
    this.adminController = new AdminQuoteRequestsController(this.submissions);
  }
}
