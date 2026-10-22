import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AdminOperationsAccess } from "./admin-operations-access";
import type { OperationsCatalogPorts } from "./admin-operations-catalog";
import { AdminAuditLogsConsoleService } from "./admin-audit-logs-console.service";
import { AdminLeadAssignmentsConsoleService } from "./admin-lead-assignments-console.service";
import { AdminProspectsConsoleService, type AdminProspectsConsoleDeps } from "./admin-prospects-console.service";
import { AdminQuoteRequestsConsoleService, type AdminQuoteConsoleDeps } from "./admin-quote-requests-console.service";
import { AdminQuoteReviewService, type AdminQuoteReviewDeps } from "./admin-quote-review.service";

export interface AdminOperationsModuleDeps extends OperationsCatalogPorts {
  audit: AuditLogWriter;
  submissions: AdminQuoteReviewDeps["submissions"] & AdminQuoteConsoleDeps["quotes"];
  assignments: AdminQuoteReviewDeps["assignments"];
  decisions: AdminQuoteConsoleDeps["decisions"] & AdminQuoteReviewDeps["decisions"];
  consent: AdminQuoteConsoleDeps["consent"];
  prospects: AdminQuoteConsoleDeps["prospects"];
  offers: AdminQuoteConsoleDeps["offers"];
  documents?: AdminQuoteConsoleDeps["documents"];
  eligibility: AdminQuoteReviewDeps["eligibility"];
  afterAssign?: AdminQuoteReviewDeps["afterAssign"];
  // Lot 6
  prospectsList: AdminProspectsConsoleDeps["prospects"];
  // Lot 6 (end)
}

/** Spec 056: admin operations consoles (EPIC H, H-01 to H-06). */
export class AdminOperationsModule {
  readonly access: AdminOperationsAccess;
  readonly quoteRequests: AdminQuoteRequestsConsoleService;
  readonly quoteReview: AdminQuoteReviewService;
  readonly leadAssignments: AdminLeadAssignmentsConsoleService;
  readonly auditLogs: AdminAuditLogsConsoleService;
  // Lot 6
  readonly prospects: AdminProspectsConsoleService;
  // Lot 6 (end)

  constructor(deps: AdminOperationsModuleDeps) {
    this.access = new AdminOperationsAccess(deps.audit);
    const catalog = { countries: deps.countries, products: deps.products, partners: deps.partners };
    this.quoteRequests = new AdminQuoteRequestsConsoleService({
      ...catalog,
      audit: deps.audit,
      access: this.access,
      quotes: deps.submissions,
      assignments: deps.assignments,
      decisions: deps.decisions,
      consent: deps.consent,
      prospects: deps.prospects,
      offers: deps.offers,
      ...(deps.documents ? { documents: deps.documents } : {})
    });
    this.quoteReview = new AdminQuoteReviewService({
      ...catalog,
      audit: deps.audit,
      access: this.access,
      submissions: deps.submissions,
      consent: deps.consent,
      decisions: deps.decisions,
      eligibility: deps.eligibility,
      assignments: deps.assignments,
      ...(deps.afterAssign ? { afterAssign: deps.afterAssign } : {})
    });
    this.leadAssignments = new AdminLeadAssignmentsConsoleService({
      ...catalog,
      audit: deps.audit,
      access: this.access,
      assignments: deps.assignments,
      decisions: deps.decisions,
      quotes: deps.submissions
    });
    this.auditLogs = new AdminAuditLogsConsoleService({ audit: deps.audit, access: this.access });
    // Lot 6
    this.prospects = new AdminProspectsConsoleService({
      ...catalog,
      audit: deps.audit,
      access: this.access,
      prospects: deps.prospectsList,
      quotes: deps.submissions
    });
    // Lot 6 (end)
  }
}
