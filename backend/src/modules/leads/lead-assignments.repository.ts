import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { BrokerStarterLeadHistoryEvent } from "../../../../packages/shared/contracts/quote.contracts";
import type { LeadAssignmentRecord, LeadAssignmentStatus } from "./lead-assignment.service";

export const LEAD_ASSIGNMENTS_REPOSITORY = Symbol("LEAD_ASSIGNMENTS_REPOSITORY");

export interface LeadAssignmentHistoryRecord extends BrokerStarterLeadHistoryEvent {
  leadAssignmentId: string;
  partnerTenantId: string;
  actorId?: string;
}

export interface LeadAssignmentsRepository extends RuntimeRepository {
  create(assignment: LeadAssignmentRecord): LeadAssignmentRecord;
  update(id: string, update: Partial<LeadAssignmentRecord>): LeadAssignmentRecord;
  activeCountForPartner(partnerTenantId: string): number;
  list(): LeadAssignmentRecord[];
  require(id: string): LeadAssignmentRecord;
  updateStatus(id: string, status: LeadAssignmentStatus, update: Partial<LeadAssignmentRecord>): LeadAssignmentRecord;
  appendHistory(event: LeadAssignmentHistoryRecord): LeadAssignmentHistoryRecord;
  historyForLead(leadAssignmentId: string): LeadAssignmentHistoryRecord[];
  historyForTenant(partnerTenantId: string): LeadAssignmentHistoryRecord[];
}

export class MemoryLeadAssignmentsRepository implements LeadAssignmentsRepository {
  readonly mode = "memory-test" as const;
  private readonly assignments: LeadAssignmentRecord[] = [];
  private readonly history: LeadAssignmentHistoryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "LeadAssignmentsRepository");
  }

  create(assignment: LeadAssignmentRecord): LeadAssignmentRecord {
    if (this.assignments.some((candidate) => candidate.quoteRequestId === assignment.quoteRequestId && candidate.status !== "closed")) {
      throw new Error("Quote request already has an active lead assignment");
    }
    this.assignments.push(assignment);
    return assignment;
  }

  update(id: string, update: Partial<LeadAssignmentRecord>): LeadAssignmentRecord {
    const assignment = this.require(id);
    Object.assign(assignment, update);
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

  updateStatus(id: string, status: LeadAssignmentStatus, update: Partial<LeadAssignmentRecord>): LeadAssignmentRecord {
    return this.update(id, { ...update, status });
  }

  appendHistory(event: LeadAssignmentHistoryRecord): LeadAssignmentHistoryRecord {
    this.history.push(event);
    return event;
  }

  historyForLead(leadAssignmentId: string): LeadAssignmentHistoryRecord[] {
    return this.history.filter((event) => event.leadAssignmentId === leadAssignmentId).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  historyForTenant(partnerTenantId: string): LeadAssignmentHistoryRecord[] {
    return this.history.filter((event) => event.partnerTenantId === partnerTenantId);
  }
}
