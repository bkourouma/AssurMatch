import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import { AdminLeadAssignmentsController } from "./admin-lead-assignments.controller";
import { BrokerEligibilityPolicy } from "./broker-eligibility-policy";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { BrokerCrmActivityService } from "./broker-crm-activity.service";
import { BrokerCrmController } from "./broker-crm.controller";
import { BrokerCrmExportPolicy } from "./broker-crm-export-policy";
import { BrokerCrmHistoryService } from "./broker-crm-history.service";
import { BrokerCrmLeadsService } from "./broker-crm-leads.service";
import { BrokerCrmNotificationsService } from "./broker-crm-notifications.service";
import { BrokerCrmPipelineService } from "./broker-crm-pipeline.service";
import { BrokerLeadsController } from "./broker-leads.controller";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterController } from "./broker-starter.controller";
import { BrokerStarterExportPolicy } from "./broker-starter-export-policy";
import { BrokerStarterHistoryService } from "./broker-starter-history.service";
import { BrokerStarterLeadActionsService } from "./broker-starter-lead-actions.service";
import { BrokerStarterLeadsService } from "./broker-starter-leads.service";
import { BrokerStarterNotificationsService } from "./broker-starter-notifications.service";
import { MemoryCrmActivityRepository, type CrmActivityRepository } from "./crm-activity.repository";
import { LeadAssignmentService } from "./lead-assignment.service";
import { LeadContactPolicy, type LeadContactLookup, type LeadQuoteStateLookup } from "./lead-contact-policy";
import { LeadDisputesService } from "./lead-disputes.service";
import { MemoryLeadAssignmentsRepository, type LeadAssignmentsRepository } from "./lead-assignments.repository";
import type { AgencyScopePort } from "../common/agency-scope";
import type { RedisClientPort } from "../common/redis/redis.module";
import { TemplateAiRoutingSuggester } from "../routing/ai-routing-suggester";
import { DeterministicLeadQualityScorer } from "../routing/lead-quality-score";
import { QuotaLock } from "../routing/quota-lock";
import type { AiRoutingSuggestionPort, PartnerCommercialStatePort, PartnerSlaPort, PartnerSlaState, RoutingLockPort } from "../routing/routing-controls.ports";
import { QuoteRoutingService, type ConsentRecordResolver, type MultiBrokerPolicy, type RoutingRuleResolver } from "./quote-routing.service";
import { RoutingDecisionService } from "./routing-decision.service";
import type { RoutingDecisionsRepository } from "./routing-decisions.repository";

export interface LeadsModuleRepositories {
  assignments?: LeadAssignmentsRepository;
  decisions?: RoutingDecisionsRepository;
  crmActivity?: CrmActivityRepository;
}

export interface LeadsModuleRoutingOptions {
  /** Admin-authored routing rules; without it the legacy first-eligible strategy applies. */
  rules?: RoutingRuleResolver | undefined;
  /** Partner webhook observer for `lead.assigned` and `lead.status_changed`; failures are swallowed. */
  events?: {
    publish(eventType: "lead.assigned" | "lead.status_changed" | "lead.accepted" | "lead.rejected", partnerTenantId: string, data: Record<string, unknown>): Promise<void>;
  } | undefined;
  /** Spec 042: consent resolver and `multi_broker_routing_enabled` gate for multi-send. */
  consent?: ConsentRecordResolver | undefined;
  multiBroker?: MultiBrokerPolicy | undefined;
  /** Spec 051 R14: persisted accreditation document check for routing eligibility. */
  accreditation?: ((partnerTenantId: string) => Promise<boolean>) | undefined;
  /** Spec 055 FR-001: request state (consent withdrawn, anonymized) for the contact visibility. */
  quoteState?: LeadQuoteStateLookup | undefined;
  /** Spec 055 FR-001: consented contact when the assignment record does not carry it. */
  contact?: LeadContactLookup | undefined;
  /** Spec 063: collaborators of the dispute service (admin names, country scopes, `billing_enabled`). */
  disputes?: {
    partners?: { list(): Promise<Array<{ id: string; legalName: string; tradeName?: string | undefined }>> } | undefined;
    countries?: { listAdmin(): Promise<Array<{ id: string; isoCode: string }>> } | undefined;
    featureFlags?: { isEnabled(key: string): boolean } | undefined;
    now?: (() => Date) | undefined;
  } | undefined;
  /** Spec 064: Enterprise display filter by agency for the CRM views (resolved lazily by the runtime). */
  agencyScope?: AgencyScopePort | undefined;
  /**
   * Lot 5 (spec 071, PRD 17 controls 11 and 9): commercial state of a broker (`PartnerSubscription`,
   * no row = active without expiry). Absent: both controls are skipped.
   */
  commercialState?: PartnerCommercialStatePort | undefined;
  /**
   * Lot 5 (spec 071, control 9): require at least one recorded partnership contract. Defaults to ON
   * exactly when `commercialState` is wired, so hand-built modules (tests) keep their scope.
   */
  requireRecordedContract?: boolean | undefined;
  /**
   * Lot 5 (spec 071, control 12, H3): enables the deterministic lead quality score. `threshold`
   * defaults to 30; 0 disables the control. Absent: control skipped.
   */
  leadQuality?: { threshold?: number | undefined } | undefined;
  /**
   * Lot 5 (spec 071, mode `ai_assisted`): `ai_assisted_routing_enabled` gate, or a full suggester.
   * A gate alone gets the template suggester (no model call, no personal data). Absent = closed.
   */
  aiRouting?: { isEnabled(): boolean } | AiRoutingSuggestionPort | undefined;
  /** Lot 5 (spec 071, ROUTE-003): Redis client of the quota lock (in-process mutex without it). */
  redis?: RedisClientPort | undefined;
  /** Lot 5 (spec 071): full replacement of the quota lock (tests). Takes precedence over `redis`. */
  lock?: RoutingLockPort | undefined;
}

export class LeadsModule {
  readonly assignments: LeadAssignmentService;
  /** Exposed so other modules (visitor documents) can attach prospect-provided CRM documents. */
  readonly crmActivityRepository: CrmActivityRepository;
  /** Spec 046: the retention anonymizer scrubs the lead action comments stored here. */
  readonly assignmentsRepository: LeadAssignmentsRepository;
  readonly decisions: RoutingDecisionService;
  readonly eligibility: BrokerEligibilityPolicy;
  readonly routing: QuoteRoutingService;
  readonly brokerController: BrokerLeadsController;
  readonly brokerStarterAccess: BrokerStarterAccessPolicy;
  readonly brokerStarterHistory: BrokerStarterHistoryService;
  readonly brokerStarterExportPolicy: BrokerStarterExportPolicy;
  readonly brokerStarterLeads: BrokerStarterLeadsService;
  readonly brokerStarterActions: BrokerStarterLeadActionsService;
  readonly brokerStarterNotifications: BrokerStarterNotificationsService;
  readonly brokerStarterController: BrokerStarterController;
  readonly brokerCrmAccess: BrokerCrmAccessPolicy;
  readonly brokerCrmHistory: BrokerCrmHistoryService;
  readonly brokerCrmExportPolicy: BrokerCrmExportPolicy;
  readonly brokerCrmActivity: BrokerCrmActivityService;
  readonly brokerCrmLeads: BrokerCrmLeadsService;
  readonly brokerCrmPipeline: BrokerCrmPipelineService;
  readonly brokerCrmNotifications: BrokerCrmNotificationsService;
  readonly brokerCrmController: BrokerCrmController;
  readonly adminController: AdminLeadAssignmentsController;
  readonly contactPolicy: LeadContactPolicy;
  /** Spec 063: lead disputes (window, record, finance decision); credit and notifier are bound by the runtime. */
  readonly disputes: LeadDisputesService;

  constructor(partners: PartnersService, licenses: PartnerLicensesService, audit = new AuditLogWriter(), brokerCrmConfig?: ConstructorParameters<typeof BrokerCrmAccessPolicy>[1], repositories: LeadsModuleRepositories = {}, routingOptions: LeadsModuleRoutingOptions = {}) {
    const assignmentRepository = repositories.assignments ?? new MemoryLeadAssignmentsRepository();
    const crmActivityRepository = repositories.crmActivity ?? new MemoryCrmActivityRepository();
    this.crmActivityRepository = crmActivityRepository;
    this.assignmentsRepository = assignmentRepository;
    this.assignments = new LeadAssignmentService(audit, assignmentRepository, routingOptions.events);
    this.decisions = new RoutingDecisionService(audit, repositories.decisions);
    const requireContract = routingOptions.requireRecordedContract ?? routingOptions.commercialState !== undefined;
    this.eligibility = new BrokerEligibilityPolicy(partners, licenses, (partnerTenantId) => assignmentRepository.monthlyCountForPartner(partnerTenantId, new Date()), routingOptions.accreditation, {
      commercialState: routingOptions.commercialState,
      ...(requireContract ? { contractRecorded: async (partnerTenantId: string) => (await partners.listContracts(partnerTenantId)).length > 0 } : {})
    });
    this.routing = new QuoteRoutingService(this.eligibility, this.decisions, this.assignments, audit, {
      rules: routingOptions.rules,
      consent: routingOptions.consent,
      multiBroker: routingOptions.multiBroker,
      stats: (partnerTenantIds, now) => assignmentRepository.routingStatsForPartners(partnerTenantIds, now),
      sla: slaPort(partners, assignmentRepository),
      leadQuality: routingOptions.leadQuality
        ? new DeterministicLeadQualityScorer({ threshold: routingOptions.leadQuality.threshold, contact: routingOptions.contact, consent: routingOptions.consent })
        : undefined,
      aiRouting: aiRoutingPort(routingOptions.aiRouting),
      lock: routingOptions.lock ?? new QuotaLock(routingOptions.redis)
    });
    this.brokerController = new BrokerLeadsController(this.assignments, audit);
    this.brokerStarterAccess = new BrokerStarterAccessPolicy(audit);
    this.brokerStarterHistory = new BrokerStarterHistoryService(assignmentRepository);
    this.brokerStarterExportPolicy = new BrokerStarterExportPolicy(this.brokerStarterAccess, audit);
    this.contactPolicy = new LeadContactPolicy(audit, routingOptions.quoteState, routingOptions.contact);
    this.disputes = new LeadDisputesService({
      audit,
      assignments: this.assignments,
      repository: crmActivityRepository,
      partners: routingOptions.disputes?.partners ?? { list: () => partners.list() },
      countries: routingOptions.disputes?.countries,
      featureFlags: routingOptions.disputes?.featureFlags,
      now: routingOptions.disputes?.now
    });
    this.brokerStarterLeads = new BrokerStarterLeadsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit, this.brokerStarterExportPolicy, this.contactPolicy, this.disputes);
    this.brokerStarterActions = new BrokerStarterLeadActionsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit, routingOptions.events, this.disputes);
    this.brokerStarterNotifications = new BrokerStarterNotificationsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit);
    this.brokerStarterController = new BrokerStarterController(this.brokerStarterLeads, this.brokerStarterActions, this.brokerStarterNotifications, this.brokerStarterAccess, audit);
    this.brokerCrmAccess = new BrokerCrmAccessPolicy(audit, brokerCrmConfig);
    this.brokerCrmHistory = new BrokerCrmHistoryService(crmActivityRepository);
    this.brokerCrmExportPolicy = new BrokerCrmExportPolicy(this.brokerCrmAccess, audit);
    this.brokerCrmActivity = new BrokerCrmActivityService(this.assignments, this.brokerCrmAccess, this.brokerCrmHistory, audit, crmActivityRepository, this.disputes);
    this.brokerCrmLeads = new BrokerCrmLeadsService(this.assignments, this.brokerCrmAccess, this.brokerCrmHistory, audit, this.brokerCrmExportPolicy, this.brokerCrmActivity, this.contactPolicy, this.disputes, routingOptions.agencyScope);
    this.brokerCrmPipeline = new BrokerCrmPipelineService(this.assignments, this.brokerCrmAccess, this.brokerCrmHistory, audit, routingOptions.events);
    this.brokerCrmNotifications = new BrokerCrmNotificationsService(this.assignments, this.brokerCrmAccess, audit);
    this.brokerCrmController = new BrokerCrmController(this.brokerCrmLeads, this.brokerCrmPipeline, this.brokerCrmActivity, this.brokerCrmNotifications);
    this.adminController = new AdminLeadAssignmentsController(this.assignments);
  }
}

/**
 * Lot 5 (spec 071, PRD 17 control 10): SLA of each eligible broker (`PartnerTenant.slaTargetMinutes`)
 * against its untouched leads. A broker without SLA is never degraded.
 */
function slaPort(partners: PartnersService, repository: LeadAssignmentsRepository): PartnerSlaPort {
  return async (partnerTenantIds, now) => {
    const targets = new Map<string, number>();
    for (const partnerTenantId of partnerTenantIds) {
      const minutes = (await partners.require(partnerTenantId).catch(() => undefined))?.slaTargetMinutes;
      if (typeof minutes === "number" && minutes > 0) targets.set(partnerTenantId, minutes);
    }
    return targets.size > 0 ? repository.slaOverrunForPartners(targets, now) : new Map<string, PartnerSlaState>();
  };
}

function aiRoutingPort(option: LeadsModuleRoutingOptions["aiRouting"]): AiRoutingSuggestionPort | undefined {
  if (!option) return undefined;
  if ("suggest" in option) return option;
  return new TemplateAiRoutingSuggester(() => option.isEnabled());
}

export { CRM_ACTIVITY_REPOSITORY, MemoryCrmActivityRepository, type CrmActivityRepository } from "./crm-activity.repository";
