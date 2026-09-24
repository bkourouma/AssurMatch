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
import { MemoryLeadAssignmentsRepository, type LeadAssignmentsRepository } from "./lead-assignments.repository";
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
    publish(eventType: "lead.assigned" | "lead.status_changed", partnerTenantId: string, data: Record<string, unknown>): Promise<void>;
  } | undefined;
  /** Spec 042: consent resolver and `multi_broker_routing_enabled` gate for multi-send. */
  consent?: ConsentRecordResolver | undefined;
  multiBroker?: MultiBrokerPolicy | undefined;
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

  constructor(partners: PartnersService, licenses: PartnerLicensesService, audit = new AuditLogWriter(), brokerCrmConfig?: ConstructorParameters<typeof BrokerCrmAccessPolicy>[1], repositories: LeadsModuleRepositories = {}, routingOptions: LeadsModuleRoutingOptions = {}) {
    const assignmentRepository = repositories.assignments ?? new MemoryLeadAssignmentsRepository();
    const crmActivityRepository = repositories.crmActivity ?? new MemoryCrmActivityRepository();
    this.crmActivityRepository = crmActivityRepository;
    this.assignmentsRepository = assignmentRepository;
    this.assignments = new LeadAssignmentService(audit, assignmentRepository, routingOptions.events);
    this.decisions = new RoutingDecisionService(audit, repositories.decisions);
    this.eligibility = new BrokerEligibilityPolicy(partners, licenses, (partnerTenantId) => assignmentRepository.monthlyCountForPartner(partnerTenantId, new Date()));
    this.routing = new QuoteRoutingService(this.eligibility, this.decisions, this.assignments, audit, {
      rules: routingOptions.rules,
      consent: routingOptions.consent,
      multiBroker: routingOptions.multiBroker,
      stats: (partnerTenantIds, now) => assignmentRepository.routingStatsForPartners(partnerTenantIds, now)
    });
    this.brokerController = new BrokerLeadsController(this.assignments, audit);
    this.brokerStarterAccess = new BrokerStarterAccessPolicy(audit);
    this.brokerStarterHistory = new BrokerStarterHistoryService(assignmentRepository);
    this.brokerStarterExportPolicy = new BrokerStarterExportPolicy(this.brokerStarterAccess, audit);
    this.brokerStarterLeads = new BrokerStarterLeadsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit, this.brokerStarterExportPolicy);
    this.brokerStarterActions = new BrokerStarterLeadActionsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit);
    this.brokerStarterNotifications = new BrokerStarterNotificationsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit);
    this.brokerStarterController = new BrokerStarterController(this.brokerStarterLeads, this.brokerStarterActions, this.brokerStarterNotifications, this.brokerStarterAccess, audit);
    this.brokerCrmAccess = new BrokerCrmAccessPolicy(audit, brokerCrmConfig);
    this.brokerCrmHistory = new BrokerCrmHistoryService(crmActivityRepository);
    this.brokerCrmExportPolicy = new BrokerCrmExportPolicy(this.brokerCrmAccess, audit);
    this.brokerCrmActivity = new BrokerCrmActivityService(this.assignments, this.brokerCrmAccess, this.brokerCrmHistory, audit, crmActivityRepository);
    this.brokerCrmLeads = new BrokerCrmLeadsService(this.assignments, this.brokerCrmAccess, this.brokerCrmHistory, audit, this.brokerCrmExportPolicy, this.brokerCrmActivity);
    this.brokerCrmPipeline = new BrokerCrmPipelineService(this.assignments, this.brokerCrmAccess, this.brokerCrmHistory, audit, routingOptions.events);
    this.brokerCrmNotifications = new BrokerCrmNotificationsService(this.assignments, this.brokerCrmAccess, audit);
    this.brokerCrmController = new BrokerCrmController(this.brokerCrmLeads, this.brokerCrmPipeline, this.brokerCrmActivity, this.brokerCrmNotifications);
    this.adminController = new AdminLeadAssignmentsController(this.assignments);
  }
}

export { CRM_ACTIVITY_REPOSITORY, MemoryCrmActivityRepository, type CrmActivityRepository } from "./crm-activity.repository";
