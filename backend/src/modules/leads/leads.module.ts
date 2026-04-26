import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import { AdminLeadAssignmentsController } from "./admin-lead-assignments.controller";
import { BrokerEligibilityPolicy } from "./broker-eligibility-policy";
import { BrokerLeadsController } from "./broker-leads.controller";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterController } from "./broker-starter.controller";
import { BrokerStarterExportPolicy } from "./broker-starter-export-policy";
import { BrokerStarterHistoryService } from "./broker-starter-history.service";
import { BrokerStarterLeadActionsService } from "./broker-starter-lead-actions.service";
import { BrokerStarterLeadsService } from "./broker-starter-leads.service";
import { BrokerStarterNotificationsService } from "./broker-starter-notifications.service";
import { LeadAssignmentService } from "./lead-assignment.service";
import { QuoteRoutingService } from "./quote-routing.service";
import { RoutingDecisionService } from "./routing-decision.service";

export class LeadsModule {
  readonly assignments: LeadAssignmentService;
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
  readonly adminController: AdminLeadAssignmentsController;

  constructor(partners: PartnersService, licenses: PartnerLicensesService, audit = new AuditLogWriter()) {
    this.assignments = new LeadAssignmentService(audit);
    this.decisions = new RoutingDecisionService(audit);
    this.eligibility = new BrokerEligibilityPolicy(partners, licenses, (partnerTenantId) => this.assignments.activeCountForPartner(partnerTenantId));
    this.routing = new QuoteRoutingService(this.eligibility, this.decisions, this.assignments, audit);
    this.brokerController = new BrokerLeadsController(this.assignments, audit);
    this.brokerStarterAccess = new BrokerStarterAccessPolicy(audit);
    this.brokerStarterHistory = new BrokerStarterHistoryService();
    this.brokerStarterExportPolicy = new BrokerStarterExportPolicy(this.brokerStarterAccess, audit);
    this.brokerStarterLeads = new BrokerStarterLeadsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit, this.brokerStarterExportPolicy);
    this.brokerStarterActions = new BrokerStarterLeadActionsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit);
    this.brokerStarterNotifications = new BrokerStarterNotificationsService(this.assignments, this.brokerStarterAccess, this.brokerStarterHistory, audit);
    this.brokerStarterController = new BrokerStarterController(this.brokerStarterLeads, this.brokerStarterActions, this.brokerStarterNotifications, this.brokerStarterAccess, audit);
    this.adminController = new AdminLeadAssignmentsController(this.assignments);
  }
}
