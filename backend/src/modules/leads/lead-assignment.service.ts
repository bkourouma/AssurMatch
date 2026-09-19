import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryLeadAssignmentsRepository, type LeadAssignmentsRepository } from "./lead-assignments.repository";

export type LeadAssignmentStatus = "assigned" | "broker_notified" | "seen" | "accepted" | "received" | "contacted" | "rejected" | "closed" | "disputed";
export type BrokerCrmPipelineStatus =
  | "nouveau"
  | "accepte"
  | "contact_tente"
  | "contacte"
  | "qualifie"
  | "documents_demandes"
  | "devis_en_preparation"
  | "devis_envoye"
  | "negociation"
  | "gagne"
  | "perdu"
  | "doublon"
  | "injoignable"
  | "hors_cible"
  | "rejete_conteste";

export interface LeadAssignmentRecord {
  id: string;
  quoteRequestId: string;
  partnerTenantId: string;
  status: LeadAssignmentStatus;
  assignedAt: Date;
  assignmentReason: string;
  publicReference?: string;
  countryCode?: string;
  productKey?: string;
  contact?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  consentRecordId?: string;
  routingDecisionId?: string;
  brokerNotificationId?: string;
  seenAt?: Date;
  seenById?: string;
  acceptedAt?: Date;
  rejectedAt?: Date;
  disputedAt?: Date;
  actionReason?: string;
  actionComment?: string;
  lastBrokerActionById?: string;
  lastBrokerActionAt?: Date;
  crmStatus?: BrokerCrmPipelineStatus;
  urgency?: "low" | "normal" | "high" | "urgent";
  source?: "comparator" | "quote_request" | "manual_import" | "partner_referral" | "support";
  assignedAdvisorId?: string;
  crmUpdatedAt?: Date;
  tags?: string[];
  /** Spec 042: how many partners received this same request. 1 = exclusive lead. */
  recipientCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Optional observer of assignment events (partner webhooks); never allowed to break the flow. */
export interface LeadAssignmentEventObserver {
  publish(eventType: "lead.assigned", partnerTenantId: string, data: Record<string, unknown>): Promise<void>;
}

export class LeadAssignmentService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly repository: LeadAssignmentsRepository = new MemoryLeadAssignmentsRepository(),
    private readonly events?: LeadAssignmentEventObserver | undefined
  ) {}

  async create(input: {
    quoteRequestId: string;
    partnerTenantId: string;
    assignmentReason: string;
    publicReference?: string;
    countryCode?: string;
    productKey?: string;
    contact?: Record<string, unknown>;
    answers?: Record<string, unknown>;
    consentRecordId?: string;
    routingDecisionId?: string;
    recipientCount?: number;
  }, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const now = new Date();
    const assignment: LeadAssignmentRecord = {
      id: crypto.randomUUID(),
      quoteRequestId: input.quoteRequestId,
      partnerTenantId: input.partnerTenantId,
      status: "assigned",
      assignedAt: now,
      assignmentReason: input.assignmentReason,
      publicReference: input.publicReference ?? input.quoteRequestId,
      countryCode: input.countryCode ?? "CI",
      productKey: input.productKey ?? "unknown",
      contact: input.contact ?? {},
      answers: input.answers ?? {},
      ...(input.consentRecordId ? { consentRecordId: input.consentRecordId } : {}),
      ...(input.routingDecisionId ? { routingDecisionId: input.routingDecisionId } : {}),
      recipientCount: input.recipientCount ?? 1,
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(assignment);
    this.audit.write({
      actor,
      action: QuoteAuditActions.routingAssigned,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { quoteRequestId: assignment.quoteRequestId, partnerTenantId: assignment.partnerTenantId },
      result: "success",
      context: { status: assignment.status, recipientCount: assignment.recipientCount ?? 1 }
    });
    await this.events?.publish("lead.assigned", assignment.partnerTenantId, {
      leadAssignmentId: assignment.id,
      publicReference: assignment.publicReference,
      countryCode: assignment.countryCode,
      productKey: assignment.productKey,
      status: assignment.status
    });
    return assignment;
  }

  async updateCrmMetadata(id: string, input: {
    crmStatus?: BrokerCrmPipelineStatus;
    urgency?: LeadAssignmentRecord["urgency"];
    source?: LeadAssignmentRecord["source"];
    assignedAdvisorId?: string;
    tags?: string[];
  }, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const assignment = await this.require(id);
    const now = new Date();
    if (input.crmStatus) assignment.crmStatus = input.crmStatus;
    if (input.urgency) assignment.urgency = input.urgency;
    if (input.source) assignment.source = input.source;
    if (input.assignedAdvisorId !== undefined) assignment.assignedAdvisorId = input.assignedAdvisorId;
    if (input.tags) assignment.tags = [...input.tags];
    assignment.crmUpdatedAt = now;
    assignment.updatedAt = now;
    if (actor.actorId) assignment.lastBrokerActionById = actor.actorId;
    assignment.lastBrokerActionAt = now;
    await this.repository.update(id, assignment);
    return assignment;
  }

  async setBrokerNotification(id: string, notificationId: string): Promise<LeadAssignmentRecord> {
    const assignment = await this.require(id);
    assignment.brokerNotificationId = notificationId;
    assignment.status = "broker_notified";
    assignment.updatedAt = new Date();
    await this.repository.update(id, assignment);
    return assignment;
  }

  async updateStatus(id: string, status: LeadAssignmentStatus, actor: ActorContext, reason: string): Promise<LeadAssignmentRecord> {
    const assignment = await this.require(id);
    const now = new Date();
    assignment.status = status;
    assignment.lastBrokerActionAt = now;
    if (actor.actorId) assignment.lastBrokerActionById = actor.actorId;
    assignment.actionReason = reason;
    assignment.updatedAt = now;
    if (status === "seen") assignment.seenAt = assignment.seenAt ?? now;
    if (status === "accepted") assignment.acceptedAt = now;
    if (status === "rejected") assignment.rejectedAt = now;
    if (status === "disputed") assignment.disputedAt = now;
    await this.repository.updateStatus(id, status, assignment);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerLeadStatusUpdated,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      reason,
      context: { status }
    });
    return assignment;
  }

  /**
   * Moves an assignment to another partner (admin reassignment). Broker-side timestamps are reset
   * so the new partner's SLA and dashboards start from the reassignment, and the previous partner
   * loses access through the tenant filter. The history event is written under the new tenant.
   */
  async reassign(id: string, input: { partnerTenantId: string; routingDecisionId: string; reason: string; previousPartnerTenantId: string }, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const assignment = await this.require(id);
    const now = new Date();
    const previousStatus = assignment.status;
    const update: Partial<LeadAssignmentRecord> = {
      partnerTenantId: input.partnerTenantId,
      status: "assigned",
      assignedAt: now,
      assignmentReason: "admin_reassigned",
      routingDecisionId: input.routingDecisionId,
      actionReason: input.reason,
      updatedAt: now,
      ...(actor.actorId ? { lastBrokerActionById: actor.actorId } : {}),
      lastBrokerActionAt: now
    };
    for (const key of ["brokerNotificationId", "seenAt", "seenById", "acceptedAt", "rejectedAt", "disputedAt", "actionComment", "crmStatus", "assignedAdvisorId", "crmUpdatedAt"] as const) {
      delete assignment[key];
    }
    Object.assign(assignment, update);
    await this.repository.update(id, assignment);
    await this.repository.appendHistory({
      id: crypto.randomUUID(),
      leadAssignmentId: id,
      partnerTenantId: input.partnerTenantId,
      ...(actor.actorId ? { actorId: actor.actorId } : {}),
      eventType: "reassigned",
      ...(previousStatus === "assigned" || previousStatus === "seen" || previousStatus === "accepted" || previousStatus === "rejected" || previousStatus === "disputed" ? { previousStatus } : {}),
      nextStatus: "assigned",
      comment: `Reassigned from partner ${input.previousPartnerTenantId}: ${input.reason}`.slice(0, 500),
      occurredAt: now.toISOString()
    });
    return assignment;
  }

  activeCountForPartner(partnerTenantId: string): Promise<number> {
    return this.repository.activeCountForPartner(partnerTenantId);
  }

  list(): Promise<LeadAssignmentRecord[]> {
    return this.repository.list();
  }

  require(id: string): Promise<LeadAssignmentRecord> {
    return this.repository.require(id);
  }
}

export { LEAD_ASSIGNMENTS_REPOSITORY, MemoryLeadAssignmentsRepository, type LeadAssignmentsRepository } from "./lead-assignments.repository";
