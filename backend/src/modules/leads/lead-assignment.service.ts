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
  createdAt: Date;
  updatedAt: Date;
}

export class LeadAssignmentService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: LeadAssignmentsRepository = new MemoryLeadAssignmentsRepository()) {}

  create(input: {
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
  }, actor: ActorContext): LeadAssignmentRecord {
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
      createdAt: now,
      updatedAt: now
    };
    this.repository.create(assignment);
    this.audit.write({
      actor,
      action: QuoteAuditActions.routingAssigned,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { quoteRequestId: assignment.quoteRequestId, partnerTenantId: assignment.partnerTenantId },
      result: "success",
      context: { status: assignment.status }
    });
    return assignment;
  }

  updateCrmMetadata(id: string, input: {
    crmStatus?: BrokerCrmPipelineStatus;
    urgency?: LeadAssignmentRecord["urgency"];
    source?: LeadAssignmentRecord["source"];
    assignedAdvisorId?: string;
    tags?: string[];
  }, actor: ActorContext): LeadAssignmentRecord {
    const assignment = this.require(id);
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
    this.repository.update(id, assignment);
    return assignment;
  }

  setBrokerNotification(id: string, notificationId: string): LeadAssignmentRecord {
    const assignment = this.require(id);
    assignment.brokerNotificationId = notificationId;
    assignment.status = "broker_notified";
    assignment.updatedAt = new Date();
    this.repository.update(id, assignment);
    return assignment;
  }

  updateStatus(id: string, status: LeadAssignmentStatus, actor: ActorContext, reason: string): LeadAssignmentRecord {
    const assignment = this.require(id);
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
    this.repository.updateStatus(id, status, assignment);
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

  activeCountForPartner(partnerTenantId: string): number {
    return this.repository.activeCountForPartner(partnerTenantId);
  }

  list(): LeadAssignmentRecord[] {
    return this.repository.list();
  }

  require(id: string): LeadAssignmentRecord {
    return this.repository.require(id);
  }
}

export { LEAD_ASSIGNMENTS_REPOSITORY, MemoryLeadAssignmentsRepository, type LeadAssignmentsRepository } from "./lead-assignments.repository";
