import {
  brokerStarterExportQuerySchema,
  brokerStarterLeadListQuerySchema,
  type BrokerStarterDashboard,
  type BrokerStarterDashboardQuery,
  type BrokerStarterExportQuery,
  type BrokerStarterLeadDetail,
  type BrokerStarterLeadListQuery,
  type BrokerStarterLeadSummary
} from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext, Page } from "../common/types";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterExportPolicy } from "./broker-starter-export-policy";
import { BrokerStarterHistoryService } from "./broker-starter-history.service";
import { LeadAssignmentService, type LeadAssignmentRecord } from "./lead-assignment.service";

export class BrokerStarterLeadsService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerStarterAccessPolicy,
    private readonly history: BrokerStarterHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly exportPolicy: BrokerStarterExportPolicy
  ) {}

  async list(actor: ActorContext, query: BrokerStarterLeadListQuery = {}): Promise<Page<BrokerStarterLeadSummary>> {
    this.access.assertPortalAccess(actor);
    const parsed = brokerStarterLeadListQuerySchema.parse(query);
    const filtered = (await this.applyFilters(actor, parsed)).map((assignment) => this.toSummary(assignment));
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterLeadListViewed,
      targetType: "LeadAssignment",
      targetId: "list",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { filters: this.safeFilters(parsed), resultCount: filtered.length }
    });
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), page, pageSize, total: filtered.length };
  }

  async detail(id: string, actor: ActorContext): Promise<BrokerStarterLeadDetail> {
    const assignment = await this.assignments.require(id);
    this.access.assertLeadAccess(actor, assignment);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterLeadDetailViewed,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      context: { status: assignment.status }
    });
    if (!assignment.seenAt) {
      const previousStatus = assignment.status;
      await this.assignments.updateStatus(id, "seen", actor, "viewed");
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerStarterLeadMarkedSeen,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId },
        result: "success",
        context: { previousStatus }
      });
      await this.history.append({
        leadAssignmentId: assignment.id,
        partnerTenantId: assignment.partnerTenantId,
        actor,
        eventType: "viewed",
        previousStatus: previousStatus === "received" || previousStatus === "contacted" ? "assigned" : previousStatus,
        nextStatus: "seen"
      });
    }
    return this.toDetail(assignment, await this.history.forLead(assignment.id));
  }

  async historyForLead(id: string, actor: ActorContext) {
    const assignment = await this.assignments.require(id);
    this.access.assertLeadAccess(actor, assignment);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterHistoryViewed,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      context: {}
    });
    return this.history.forLead(id);
  }

  async dashboard(actor: ActorContext, query: BrokerStarterDashboardQuery = {}): Promise<BrokerStarterDashboard> {
    this.access.assertDashboardAccess(actor);
    const filtered = await this.applyFilters(actor, query);
    const dashboard = {
      received: filtered.length,
      seen: filtered.filter((assignment) => Boolean(assignment.seenAt) || assignment.status === "seen").length,
      accepted: filtered.filter((assignment) => assignment.status === "accepted").length,
      rejected: filtered.filter((assignment) => assignment.status === "rejected").length,
      disputed: filtered.filter((assignment) => assignment.status === "disputed").length
    };
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterDashboardViewed,
      targetType: "LeadAssignment",
      targetId: "dashboard",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { filters: this.safeFilters(query), dashboard }
    });
    return dashboard;
  }

  async exportCsv(actor: ActorContext, query: BrokerStarterExportQuery = {}): Promise<string> {
    const parsed = brokerStarterExportQuerySchema.parse(query);
    this.exportPolicy.assertCanExport(actor, parsed);
    const rows = (await this.applyFilters(actor, parsed)).map((assignment) => this.toSummary(assignment));
    return this.exportPolicy.toCsv(actor, rows, parsed);
  }

  private async applyFilters(actor: ActorContext, query: Partial<BrokerStarterLeadListQuery>): Promise<LeadAssignmentRecord[]> {
    return (await this.assignments.list())
      .filter((assignment) => assignment.partnerTenantId === actor.partnerTenantId)
      .filter((assignment) => !query.status || this.normalizeStatus(assignment) === query.status)
      .filter((assignment) => !query.productKey || assignment.productKey === query.productKey)
      .filter((assignment) => !query.countryCode || assignment.countryCode === query.countryCode)
      .filter((assignment) => !query.dateFrom || assignment.assignedAt >= new Date(query.dateFrom))
      .filter((assignment) => !query.dateTo || assignment.assignedAt <= new Date(query.dateTo));
  }

  private toSummary(assignment: LeadAssignmentRecord): BrokerStarterLeadSummary {
    return {
      leadAssignmentId: assignment.id,
      publicReference: assignment.publicReference ?? assignment.quoteRequestId,
      countryCode: assignment.countryCode ?? "CI",
      productKey: assignment.productKey ?? "unknown",
      status: this.normalizeStatus(assignment),
      assignedAt: assignment.assignedAt.toISOString(),
      seen: Boolean(assignment.seenAt) || assignment.status === "seen",
      ...(assignment.seenAt ? { seenAt: assignment.seenAt.toISOString() } : {})
    };
  }

  private toDetail(assignment: LeadAssignmentRecord, history: BrokerStarterLeadDetail["history"]): BrokerStarterLeadDetail {
    return {
      ...this.toSummary(assignment),
      contact: assignment.contact ?? {},
      answers: assignment.answers ?? {},
      history
    };
  }

  private normalizeStatus(assignment: LeadAssignmentRecord): BrokerStarterLeadSummary["status"] {
    if (assignment.status === "received" || assignment.status === "contacted") return "assigned";
    return assignment.status as BrokerStarterLeadSummary["status"];
  }

  private safeFilters(query: Partial<BrokerStarterLeadListQuery>): Record<string, unknown> {
    return {
      status: query.status,
      productKey: query.productKey,
      countryCode: query.countryCode,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo
    };
  }
}
