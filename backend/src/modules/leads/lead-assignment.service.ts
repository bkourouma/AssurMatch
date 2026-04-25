import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";

export type LeadAssignmentStatus = "assigned" | "broker_notified" | "received" | "contacted" | "rejected" | "closed" | "disputed";

export interface LeadAssignmentRecord {
  id: string;
  quoteRequestId: string;
  partnerTenantId: string;
  status: LeadAssignmentStatus;
  assignedAt: Date;
  assignmentReason: string;
  routingDecisionId?: string;
  brokerNotificationId?: string;
  lastBrokerActionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class LeadAssignmentService {
  private readonly assignments: LeadAssignmentRecord[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: { quoteRequestId: string; partnerTenantId: string; assignmentReason: string; routingDecisionId?: string }, actor: ActorContext): LeadAssignmentRecord {
    if (this.assignments.some((assignment) => assignment.quoteRequestId === input.quoteRequestId && assignment.status !== "closed")) {
      throw new Error("Quote request already has an active lead assignment");
    }
    const now = new Date();
    const assignment: LeadAssignmentRecord = {
      id: crypto.randomUUID(),
      quoteRequestId: input.quoteRequestId,
      partnerTenantId: input.partnerTenantId,
      status: "assigned",
      assignedAt: now,
      assignmentReason: input.assignmentReason,
      ...(input.routingDecisionId ? { routingDecisionId: input.routingDecisionId } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.assignments.push(assignment);
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

  setBrokerNotification(id: string, notificationId: string): LeadAssignmentRecord {
    const assignment = this.require(id);
    assignment.brokerNotificationId = notificationId;
    assignment.status = "broker_notified";
    assignment.updatedAt = new Date();
    return assignment;
  }

  updateStatus(id: string, status: LeadAssignmentStatus, actor: ActorContext, reason: string): LeadAssignmentRecord {
    const assignment = this.require(id);
    assignment.status = status;
    assignment.lastBrokerActionAt = new Date();
    assignment.updatedAt = new Date();
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
    return this.assignments.filter((assignment) => assignment.partnerTenantId === partnerTenantId && assignment.status !== "closed").length;
  }

  list(): LeadAssignmentRecord[] {
    return [...this.assignments];
  }

  require(id: string): LeadAssignmentRecord {
    const assignment = this.assignments.find((candidate) => candidate.id === id);
    if (!assignment) throw new Error(`Lead assignment ${id} not found`);
    return assignment;
  }
}
