import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import { MemorySatisfactionSurveyRepository, type SatisfactionSurveyRepository } from "./satisfaction-survey.model";
import { SatisfactionSurveyTokenService } from "./satisfaction-survey-token.service";
import { SatisfactionSurveyEmailTemplateService } from "./satisfaction-survey-email-template.service";
import { SatisfactionSurveyTriggerService, type SatisfactionSurveyTriggerDeps } from "./satisfaction-survey-trigger.service";
import { SatisfactionSurveysDrainService, type SatisfactionSurveysDrainDeps } from "./satisfaction-surveys-drain.service";
import { SatisfactionSurveysService, type SatisfactionSurveysServiceDeps } from "./satisfaction-surveys.service";
import { SatisfactionSurveysController } from "./satisfaction-surveys.controller";
import { MemoryNotificationUnsubscribeRepository, SurveyUnsubscribeService, type NotificationUnsubscribeRepository } from "./survey-unsubscribe.service";

export interface SatisfactionSurveysModuleDeps {
  assignments: SatisfactionSurveyTriggerDeps["assignments"];
  quotes: SatisfactionSurveyTriggerDeps["quotes"];
  prospects: SatisfactionSurveysDrainDeps["prospects"];
  consent: SatisfactionSurveyTriggerDeps["consent"];
  countries: SatisfactionSurveyTriggerDeps["countries"];
  products: SatisfactionSurveyTriggerDeps["products"];
  emailDelivery: SatisfactionSurveysDrainDeps["emailDelivery"];
  isFlagEnabled: (flag: string) => boolean;
  complianceAlerts?: SatisfactionSurveysServiceDeps["complianceAlerts"];
}

export class SatisfactionSurveysModule {
  readonly repository: SatisfactionSurveyRepository;
  readonly tokenService: SatisfactionSurveyTokenService;
  readonly emailTemplate: SatisfactionSurveyEmailTemplateService;
  readonly trigger: SatisfactionSurveyTriggerService;
  readonly drain: SatisfactionSurveysDrainService;
  readonly service: SatisfactionSurveysService;
  readonly controller: SatisfactionSurveysController;
  /** Spec 061 FR-005: opt-out of the survey e-mails. */
  readonly unsubscribe: SurveyUnsubscribeService;

  constructor(
    deps: SatisfactionSurveysModuleDeps,
    audit = new AuditLogWriter(),
    redis: RedisClientPort = new InMemoryRedisClient(),
    repository?: SatisfactionSurveyRepository,
    unsubscribeRepository?: NotificationUnsubscribeRepository
  ) {
    this.repository = repository ?? new MemorySatisfactionSurveyRepository();
    this.tokenService = new SatisfactionSurveyTokenService();
    this.emailTemplate = new SatisfactionSurveyEmailTemplateService();
    const abuseGuard = new PublicAbuseGuardService(redis);
    this.unsubscribe = new SurveyUnsubscribeService(unsubscribeRepository ?? new MemoryNotificationUnsubscribeRepository(), audit);

    this.trigger = new SatisfactionSurveyTriggerService({
      repository: this.repository,
      tokenService: this.tokenService,
      audit,
      assignments: deps.assignments,
      quotes: deps.quotes,
      consent: deps.consent,
      countries: deps.countries,
      products: deps.products,
      isFlagEnabled: deps.isFlagEnabled
    });

    this.drain = new SatisfactionSurveysDrainService({
      repository: this.repository,
      audit,
      emailTemplate: this.emailTemplate,
      emailDelivery: deps.emailDelivery,
      quotes: deps.quotes,
      prospects: deps.prospects,
      consent: deps.consent,
      countries: deps.countries,
      products: deps.products,
      isFlagEnabled: deps.isFlagEnabled,
      tokenService: this.tokenService,
      unsubscribe: this.unsubscribe
    });

    this.service = new SatisfactionSurveysService({
      repository: this.repository,
      tokenService: this.tokenService,
      abuseGuard,
      audit,
      complianceAlerts: deps.complianceAlerts
    });

    this.controller = new SatisfactionSurveysController(this.service);
  }
}

export * from "./satisfaction-survey.model";
export * from "./satisfaction-survey-token.service";
export * from "./satisfaction-survey-email-template.service";
export * from "./satisfaction-survey-trigger.service";
export * from "./satisfaction-surveys-drain.service";
export * from "./satisfaction-surveys.service";
export * from "./satisfaction-surveys.controller";
export * from "./survey-unsubscribe.service";
