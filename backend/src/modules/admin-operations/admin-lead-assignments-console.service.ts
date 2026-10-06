import type {
  AdminLeadAssignmentListItem,
  AdminOperationsLeadAssignmentQuery,
  AdminPage,
  AdminRoutingDecisionView,
  AdminRoutingHistoryQuery
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { RoutingDecisionRecord } from "../leads/routing-decision.service";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import { OPERATIONS_ROLES, isoOrNull, paginate, parseDateFilter, withinPeriod, type AdminOperationsAccess } from "./admin-operations-access";
import { loadOperationsCatalog, type OperationsCatalog, type OperationsCatalogPorts } from "./admin-operations-catalog";
import { toDecisionView } from "./admin-quote-requests-console.service";

export interface AdminLeadAssignmentsConsoleDeps extends OperationsCatalogPorts {
  audit: AuditLogWriter;
  access: AdminOperationsAccess;
  assignments: { list(): Promise<LeadAssignmentRecord[]> };
  decisions: { list(): Promise<RoutingDecisionRecord[]> };
  quotes: { list(): Promise<QuoteRequestRecord[]> };
}

/** H-03 (lead assignments) and H-06 (routing decision history). */
export class AdminLeadAssignmentsConsoleService {
  constructor(private readonly deps: AdminLeadAssignmentsConsoleDeps) {}

  async list(actor: ActorContext, query: AdminOperationsLeadAssignmentQuery): Promise<AdminPage<AdminLeadAssignmentListItem>> {
    this.deps.access.assert(actor, { roles: OPERATIONS_ROLES, permissions: ["lead_assignments:read"] }, { type: "LeadAssignment", id: "list" });
    const catalog = await loadOperationsCatalog(this.deps);
    const from = parseDateFilter(query.from, "from");
    const to = parseDateFilter(query.to, "to");
    const quotes = await this.quoteIndex();
    const rows = (await this.deps.assignments.list())
      .map((assignment) => toAssignmentListItem(assignment, catalog, quotes.get(assignment.quoteRequestId)))
      .filter((row) => this.deps.access.inScope(actor, {
        countryCode: row.countryCode ?? undefined,
        countryId: row.countryCode ? catalog.countryId(row.countryCode) : undefined,
        productKey: row.productKey ?? undefined,
        productId: row.productKey ? catalog.productId(row.productKey) : undefined
      }))
      .filter((row) => !query.countryCode || row.countryCode === query.countryCode)
      .filter((row) => !query.productKey || row.productKey === query.productKey)
      .filter((row) => !query.partnerTenantId || row.partnerTenantId === query.partnerTenantId)
      .filter((row) => !query.status || row.status === query.status)
      .filter((row) => !query.quoteRequestId || row.quoteRequestId === query.quoteRequestId)
      .filter((row) => withinPeriod(new Date(row.assignedAt), from, to))
      .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
    const page = paginate(rows, query.page, query.pageSize);
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.leadAssignmentsListed,
      targetType: "LeadAssignment",
      targetId: "list",
      result: "success",
      context: { total: page.total, page: page.page }
    });
    return page;
  }

  async routingHistory(actor: ActorContext, query: AdminRoutingHistoryQuery): Promise<AdminPage<AdminRoutingDecisionView & { publicReference: string | null; countryCode: string | null; productKey: string | null }>> {
    this.deps.access.assert(actor, { roles: OPERATIONS_ROLES, permissions: ["routing_rules:read"] }, { type: "RoutingDecision", id: "history" });
    const catalog = await loadOperationsCatalog(this.deps);
    const from = parseDateFilter(query.from, "from");
    const to = parseDateFilter(query.to, "to");
    const quotes = await this.quoteIndex();
    const rows = (await this.deps.decisions.list())
      .filter((decision) => {
        const quote = quotes.get(decision.quoteRequestId);
        // A decision whose request is unknown cannot be scoped: only an unrestricted actor sees it.
        if (!quote) return this.deps.access.inScope(actor, {});
        return this.deps.access.inScope(actor, {
          countryId: quote.countryId,
          countryCode: quote.countryCode || catalog.countryCode(quote.countryId),
          productId: quote.productId,
          productKey: quote.productKey || catalog.productKey(quote.productId)
        });
      })
      .filter((decision) => !query.result || decision.result === query.result)
      .filter((decision) => !query.quoteRequestId || decision.quoteRequestId === query.quoteRequestId)
      .filter((decision) => !query.countryId || quotes.get(decision.quoteRequestId)?.countryId === query.countryId)
      .filter((decision) => withinPeriod(new Date(decision.createdAt), from, to))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((decision) => {
        const quote = quotes.get(decision.quoteRequestId);
        return {
          ...toDecisionView(decision, catalog),
          publicReference: quote?.publicReference ?? null,
          countryCode: quote ? quote.countryCode || catalog.countryCode(quote.countryId) || null : null,
          productKey: quote ? quote.productKey || catalog.productKey(quote.productId) || null : null
        };
      });
    const page = paginate(rows, query.page, query.pageSize);
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.routingHistoryRead,
      targetType: "RoutingDecision",
      targetId: "history",
      result: "success",
      context: { total: page.total, page: page.page }
    });
    return page;
  }

  private async quoteIndex(): Promise<Map<string, QuoteRequestRecord>> {
    return new Map((await this.deps.quotes.list()).map((quote) => [quote.id, quote]));
  }
}

/** Never carries the assignment's `contact` or `answers`: the console lists routing facts only. */
export function toAssignmentListItem(assignment: LeadAssignmentRecord, catalog: OperationsCatalog, quote: QuoteRequestRecord | undefined): AdminLeadAssignmentListItem {
  return {
    id: assignment.id,
    quoteRequestId: assignment.quoteRequestId,
    publicReference: assignment.publicReference ?? quote?.publicReference ?? null,
    countryCode: assignment.countryCode ?? (quote ? quote.countryCode || catalog.countryCode(quote.countryId) || null : null),
    productKey: assignment.productKey ?? (quote ? quote.productKey || catalog.productKey(quote.productId) || null : null),
    partnerTenantId: assignment.partnerTenantId,
    partnerLegalName: catalog.partnerName(assignment.partnerTenantId),
    status: assignment.status,
    assignmentReason: assignment.assignmentReason,
    recipientCount: assignment.recipientCount ?? 1,
    assignedAt: isoOrNull(assignment.assignedAt) ?? "",
    lastBrokerActionAt: isoOrNull(assignment.lastBrokerActionAt)
  };
}
