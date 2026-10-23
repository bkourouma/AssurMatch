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
import type { AgencyScopePort } from "../common/agency-scope";
import type { ActorContext, Page } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { BrokerCrmExportPolicy } from "./broker-crm-export-policy";
import { BrokerCrmHistoryService } from "./broker-crm-history.service";
import type { BrokerCrmActivityService } from "./broker-crm-activity.service";
import { maskEmail, maskPhone, type LeadContactPolicy } from "./lead-contact-policy";
import { LeadAssignmentService, type LeadAssignmentRecord } from "./lead-assignment.service";
import type { LeadDisputesService } from "./lead-disputes.service";

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

type BrokerCrmLeadSort = "assignedAt" | "status" | "priority" | "urgency";
interface PriorityEntry {
  score: number;
  level: "low" | "medium" | "high";
}
/** `(actor) => Map<leadId, approved score>` of the actor's own CRM perimeter, never throwing, empty when scoring is closed. */
export type PriorityScoreSource = (actor: ActorContext) => Promise<ReadonlyMap<string, number | { score: number; level?: "low" | "medium" | "high" }>>;
const URGENCY_RANK: Record<"low" | "normal" | "high" | "urgent", number> = { low: 0, normal: 1, high: 2, urgent: 3 };

export class BrokerCrmLeadsService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerCrmAccessPolicy,
    private readonly history: BrokerCrmHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly exportPolicy: BrokerCrmExportPolicy,
    private readonly activity?: BrokerCrmActivityService,
    /** Spec 055 FR-001: full contact for the assigned broker (audited), masked after a withdrawal. */
    private readonly contactPolicy?: LeadContactPolicy,
    /** Spec 063: dispute window shown on the lead detail. */
    private readonly disputes?: LeadDisputesService,
    /** Spec 064: Enterprise display filter by agency, applied after the access policy. */
    private readonly agencyScope?: AgencyScopePort
  ) {}

  /**
   * Lot 3 (spec 069 FR-004): late link to the human-approved AI priority scores. The AI service depends on this
   * service, so the port is set after construction by the runtime (no circular import). Unset = no score anywhere.
   */
  setPriorityScoreSource(source: PriorityScoreSource | undefined): void {
    this.priorityScores = source;
  }

  private priorityScores: PriorityScoreSource | undefined;

  async list(actor: ActorContext, query: BrokerCrmLeadListQuery = {}): Promise<Page<BrokerCrmLeadSummary>> {
    const parsed = brokerCrmLeadListQuerySchema.parse(query);
    const rows = await this.applyFilters(actor, parsed);
    // One read of the approved scores per request, joined only to the leads of the filtered perimeter.
    const scores = await this.scoresFor(actor);
    const filtered = this.sortRows(rows, scores, parsed.sort, parsed.sortDirection).map((assignment) => this.toSummary(assignment, scores.get(assignment.id)));
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
    const revealed = this.contactPolicy ? await this.contactPolicy.reveal(assignment, actor, "crm") : { contact: assignment.contact ?? {}, visibility: "full" as const };
    return {
      ...this.toSummary(assignment),
      contact: revealed.contact,
      contactVisibility: revealed.visibility,
      answers: assignment.answers ?? {},
      history: await this.history.forLead(id),
      notes: await this.activity?.notesForLead(id) ?? [],
      tasks: await this.activity?.tasksForLead(id) ?? [],
      reminders: await this.activity?.remindersForLead(id) ?? [],
      documents: await this.activity?.documentsForLead(id) ?? [],
      proposals: await this.activity?.proposalsForLead(id) ?? [],
      disputes: await this.activity?.disputesForLead(id) ?? [],
      ...(this.disputes ? { disputeWindow: this.disputes.windowFor(assignment) } : {})
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
    // Spec 064: resolved after the access check (an unauthorised actor learns nothing about agencies); callers that must
    // not filter (the loss analysis) simply leave agencyId out of their query.
    const inAgency = await this.agencyScope?.resolve(actor, query.agencyId);
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
      .filter((assignment) => !inAgency || inAgency(assignment.assignedAdvisorId))
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

  private async scoresFor(actor: ActorContext): Promise<Map<string, PriorityEntry>> {
    const normalised = new Map<string, PriorityEntry>();
    if (!this.priorityScores) return normalised;
    try {
      for (const [leadId, value] of await this.priorityScores(actor)) {
        const score = typeof value === "number" ? value : value.score;
        if (!Number.isFinite(score)) continue;
        const bounded = Math.min(100, Math.max(0, Math.round(score)));
        const level = typeof value === "number" || !value.level ? (bounded >= 70 ? "high" : bounded >= 40 ? "medium" : "low") : value.level;
        normalised.set(leadId, { score: bounded, level });
      }
    } catch {
      // A scoring failure never breaks the list: it simply carries no score.
    }
    return normalised;
  }

  /** Stable sort over the whole filtered set; ties fall back to assignedAt desc then id. */
  private sortRows(rows: LeadAssignmentRecord[], scores: Map<string, PriorityEntry>, sort: BrokerCrmLeadSort = "assignedAt", direction: "asc" | "desc" = "desc"): LeadAssignmentRecord[] {
    const sign = direction === "asc" ? 1 : -1;
    const tieBreak = (left: LeadAssignmentRecord, right: LeadAssignmentRecord) => right.assignedAt.getTime() - left.assignedAt.getTime() || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    // Without any approved score (flag closed, opt-out, Starter) the priority sort falls back to assignedAt.
    const effective = sort === "priority" && scores.size === 0 ? "assignedAt" : sort;
    const primary = (left: LeadAssignmentRecord, right: LeadAssignmentRecord): number => {
      switch (effective) {
        case "assignedAt":
          return sign * (left.assignedAt.getTime() - right.assignedAt.getTime());
        case "status":
          return sign * (CRM_STATUSES.indexOf(this.statusOf(left)) - CRM_STATUSES.indexOf(this.statusOf(right)));
        case "urgency":
          return sign * (URGENCY_RANK[left.urgency ?? "normal"] - URGENCY_RANK[right.urgency ?? "normal"]);
        case "priority": {
          const leftScore = scores.get(left.id)?.score;
          const rightScore = scores.get(right.id)?.score;
          // Leads without an approved score always come last, whatever the direction.
          if (leftScore === undefined || rightScore === undefined) return leftScore === rightScore ? 0 : leftScore === undefined ? 1 : -1;
          return sign * (leftScore - rightScore);
        }
      }
    };
    return [...rows].sort((left, right) => primary(left, right) || tieBreak(left, right));
  }

  private toSummary(assignment: LeadAssignmentRecord, priority?: PriorityEntry): BrokerCrmLeadSummary {
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
      // Spec 042 D1: the partner sees that the lead is shared and with how many others, never who.
      isShared: (assignment.recipientCount ?? 1) > 1,
      recipientCount: assignment.recipientCount ?? 1,
      ...(assignment.assignedAdvisorId ? { advisorId: assignment.assignedAdvisorId } : {}),
      ...(typeof contact.displayName === "string" ? { prospectName: contact.displayName } : {}),
      ...(email ? { emailMasked: this.maskEmail(email) } : {}),
      ...(phone ? { phoneMasked: this.maskPhone(phone) } : {}),
      ...(priority ? { priorityScore: priority.score, priorityLevel: priority.level } : {})
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
    return maskEmail(email);
  }

  private maskPhone(phone: string): string {
    return maskPhone(phone);
  }

  private safeFilters(query: Partial<BrokerCrmLeadListQuery>): Record<string, unknown> {
    return {
      status: query.status,
      productKey: query.productKey,
      countryCode: query.countryCode,
      advisorId: query.advisorId,
      agencyId: query.agencyId,
      urgency: query.urgency,
      source: query.source,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search ? "present" : undefined
    };
  }
}
