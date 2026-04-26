import {
  brokerCrmExportQuerySchema,
  brokerCrmLeadListQuerySchema,
  type BrokerCrmDashboard,
  type BrokerCrmExportQuery,
  type BrokerCrmLeadDetail,
  type BrokerCrmLeadListQuery,
  type BrokerCrmLeadSummary,
  type BrokerCrmPipelineStatus
} from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext, Page } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { BrokerCrmExportPolicy } from "./broker-crm-export-policy";
import { BrokerCrmHistoryService } from "./broker-crm-history.service";
import type { BrokerCrmActivityService } from "./broker-crm-activity.service";
import { LeadAssignmentService, type LeadAssignmentRecord } from "./lead-assignment.service";

const CRM_STATUSES: BrokerCrmPipelineStatus[] = [
  "nouveau",
  "accepte",
  "contact_tente",
  "contacte",
  "qualifie",
  "documents_demandes",
  "devis_en_preparation",
  "devis_envoye",
  "negociation",
  "gagne",
  "perdu",
  "doublon",
  "injoignable",
  "hors_cible",
  "rejete_conteste"
];

export class BrokerCrmLeadsService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerCrmAccessPolicy,
    private readonly history: BrokerCrmHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly exportPolicy: BrokerCrmExportPolicy,
    private readonly activity?: BrokerCrmActivityService
  ) {}

  async list(actor: ActorContext, query: BrokerCrmLeadListQuery = {}): Promise<Page<BrokerCrmLeadSummary>> {
    const parsed = brokerCrmLeadListQuerySchema.parse(query);
    const filtered = (await this.applyFilters(actor, parsed)).map((assignment) => this.toSummary(assignment));
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmLeadListViewed,
      targetType: "BrokerCrmLead",
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

  async kanban(actor: ActorContext, query: BrokerCrmLeadListQuery = {}): Promise<Record<BrokerCrmPipelineStatus, BrokerCrmLeadSummary[]>> {
    const columns = {} as Record<BrokerCrmPipelineStatus, BrokerCrmLeadSummary[]>;
    CRM_STATUSES.forEach((status) => {
      columns[status] = [];
    });
    (await this.applyFilters(actor, brokerCrmLeadListQuerySchema.parse(query))).forEach((assignment) => {
      columns[this.statusOf(assignment)].push(this.toSummary(assignment));
    });
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmKanbanViewed,
      targetType: "BrokerCrmLead",
      targetId: "kanban",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { filters: this.safeFilters(query) }
    });
    return columns;
  }

  async detail(id: string, actor: ActorContext): Promise<BrokerCrmLeadDetail> {
    const assignment = await this.assignments.require(id);
    this.access.assertLeadRead(actor, assignment);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmLeadDetailViewed,
      targetType: "LeadAssignment",
      targetId: id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      context: { status: this.statusOf(assignment) }
    });
    return {
      ...this.toSummary(assignment),
      contact: assignment.contact ?? {},
      answers: assignment.answers ?? {},
      history: await this.history.forLead(id),
      notes: await this.activity?.notesForLead(id) ?? [],
      tasks: await this.activity?.tasksForLead(id) ?? [],
      reminders: await this.activity?.remindersForLead(id) ?? [],
      documents: await this.activity?.documentsForLead(id) ?? [],
      proposals: await this.activity?.proposalsForLead(id) ?? [],
      disputes: await this.activity?.disputesForLead(id) ?? []
    };
  }

  async dashboard(actor: ActorContext, query: BrokerCrmLeadListQuery = {}): Promise<BrokerCrmDashboard> {
    const rows = await this.applyFilters(actor, query);
    const byStatus = Object.fromEntries(CRM_STATUSES.map((status) => [status, rows.filter((assignment) => this.statusOf(assignment) === status).length])) as Record<BrokerCrmPipelineStatus, number>;
    const dashboard = {
      total: rows.length,
      byStatus,
      urgent: rows.filter((assignment) => assignment.urgency === "urgent").length,
      overdueTasks: await this.activity?.overdueTaskCount(actor) ?? 0
    };
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmDashboardViewed,
      targetType: "BrokerCrmDashboard",
      targetId: "dashboard",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { total: dashboard.total }
    });
    return dashboard;
  }

  async exportCsv(actor: ActorContext, query: BrokerCrmExportQuery = {}): Promise<string> {
    const parsed = brokerCrmExportQuerySchema.parse(query);
    this.exportPolicy.assertCanExport(actor, parsed);
    return this.exportPolicy.toCsv(actor, (await this.applyFilters(actor, parsed)).map((assignment) => this.toSummary(assignment)), parsed);
  }

  async applyFilters(actor: ActorContext, query: Partial<BrokerCrmLeadListQuery>): Promise<LeadAssignmentRecord[]> {
    this.access.assertCrmAccess(actor);
    return (await this.assignments.list())
      .filter((assignment) => assignment.partnerTenantId === actor.partnerTenantId)
      .filter((assignment) => {
        try {
          this.access.assertLeadRead(actor, assignment);
          return true;
        } catch {
          return false;
        }
      })
      .filter((assignment) => !query.status || this.statusOf(assignment) === query.status)
      .filter((assignment) => !query.productKey || assignment.productKey === query.productKey)
      .filter((assignment) => !query.countryCode || assignment.countryCode === query.countryCode)
      .filter((assignment) => !query.advisorId || assignment.assignedAdvisorId === query.advisorId)
      .filter((assignment) => !query.urgency || (assignment.urgency ?? "normal") === query.urgency)
      .filter((assignment) => !query.source || (assignment.source ?? "quote_request") === query.source)
      .filter((assignment) => !query.dateFrom || assignment.assignedAt >= new Date(query.dateFrom))
      .filter((assignment) => !query.dateTo || assignment.assignedAt <= new Date(query.dateTo))
      .filter((assignment) => this.matchesSearch(actor, assignment, query.search));
  }

  private toSummary(assignment: LeadAssignmentRecord): BrokerCrmLeadSummary {
    const contact = assignment.contact ?? {};
    const email = typeof contact.email === "string" ? contact.email : undefined;
    const phone = typeof contact.phone === "string" ? contact.phone : undefined;
    return {
      leadAssignmentId: assignment.id,
      publicReference: assignment.publicReference ?? assignment.quoteRequestId,
      countryCode: assignment.countryCode ?? "CI",
      productKey: assignment.productKey ?? "unknown",
      status: this.statusOf(assignment),
      assignedAt: assignment.assignedAt.toISOString(),
      urgency: assignment.urgency ?? "normal",
      source: assignment.source ?? "quote_request",
      ...(assignment.assignedAdvisorId ? { advisorId: assignment.assignedAdvisorId } : {}),
      ...(typeof contact.displayName === "string" ? { prospectName: contact.displayName } : {}),
      ...(email ? { emailMasked: this.maskEmail(email) } : {}),
      ...(phone ? { phoneMasked: this.maskPhone(phone) } : {})
    };
  }

  private statusOf(assignment: LeadAssignmentRecord): BrokerCrmPipelineStatus {
    if (assignment.crmStatus) return assignment.crmStatus;
    if (assignment.status === "accepted") return "accepte";
    if (assignment.status === "contacted") return "contacte";
    if (assignment.status === "rejected") return "rejete_conteste";
    if (assignment.status === "disputed") return "rejete_conteste";
    return "nouveau";
  }

  private matchesSearch(actor: ActorContext, assignment: LeadAssignmentRecord, search?: string): boolean {
    if (!search) return true;
    const needle = search.toLowerCase();
    const contact = assignment.contact ?? {};
    const publicFields = [assignment.publicReference, assignment.quoteRequestId, contact.displayName].filter((value): value is string => typeof value === "string");
    const sensitiveFields = this.access.canSeeSensitiveSearch(actor) ? [contact.email, contact.phone].filter((value): value is string => typeof value === "string") : [];
    return [...publicFields, ...sensitiveFields].some((value) => value.toLowerCase().includes(needle));
  }

  private maskEmail(email: string): string {
    const [user, domain] = email.split("@");
    return `${user?.slice(0, 2) ?? "**"}***@${domain ?? "masked"}`;
  }

  private maskPhone(phone: string): string {
    return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
  }

  private safeFilters(query: Partial<BrokerCrmLeadListQuery>): Record<string, unknown> {
    return {
      status: query.status,
      productKey: query.productKey,
      countryCode: query.countryCode,
      advisorId: query.advisorId,
      urgency: query.urgency,
      source: query.source,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search ? "present" : undefined
    };
  }
}
