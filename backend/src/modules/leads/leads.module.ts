import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import { AdminLeadAssignmentsController } from "./admin-lead-assignments.controller";
import { BrokerEligibilityPolicy } from "./broker-eligibility-policy";
import { BrokerLeadsController } from "./broker-leads.controller";
import { LeadAssignmentService } from "./lead-assignment.service";
import { QuoteRoutingService } from "./quote-routing.service";
import { RoutingDecisionService } from "./routing-decision.service";

export class LeadsModule {
  readonly assignments: LeadAssignmentService;
  readonly decisions: RoutingDecisionService;
  readonly eligibility: BrokerEligibilityPolicy;
  readonly routing: QuoteRoutingService;
  readonly brokerController: BrokerLeadsController;
  readonly adminController: AdminLeadAssignmentsController;

  constructor(partners: PartnersService, licenses: PartnerLicensesService, audit = new AuditLogWriter()) {
    this.assignments = new LeadAssignmentService(audit);
    this.decisions = new RoutingDecisionService(audit);
    this.eligibility = new BrokerEligibilityPolicy(partners, licenses, (partnerTenantId) => this.assignments.activeCountForPartner(partnerTenantId));
    this.routing = new QuoteRoutingService(this.eligibility, this.decisions, this.assignments, audit);
    this.brokerController = new BrokerLeadsController(this.assignments, audit);
    this.adminController = new AdminLeadAssignmentsController(this.assignments);
  }
}
