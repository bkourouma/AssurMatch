import type { BrokerStarterLeadHistoryEvent, BrokerStarterLeadStatus, BrokerStarterReason } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import { MemoryLeadAssignmentsRepository, type LeadAssignmentHistoryRecord, type LeadAssignmentsRepository } from "./lead-assignments.repository";

export interface BrokerStarterHistoryInput {
  leadAssignmentId: string;
  partnerTenantId: string;
  actor?: ActorContext;
  eventType: BrokerStarterLeadHistoryEvent["eventType"];
  previousStatus?: BrokerStarterLeadStatus;
  nextStatus?: BrokerStarterLeadStatus;
  reason?: BrokerStarterReason;
  comment?: string;
}

export class BrokerStarterHistoryService {
  constructor(private readonly repository: LeadAssignmentsRepository = new MemoryLeadAssignmentsRepository()) {}

  async append(input: BrokerStarterHistoryInput): Promise<BrokerStarterLeadHistoryEvent> {
    const event: LeadAssignmentHistoryRecord = {
      id: crypto.randomUUID(),
      leadAssignmentId: input.leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      ...(input.actor?.actorId ? { actorId: input.actor.actorId } : {}),
      eventType: input.eventType,
      ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
      ...(input.nextStatus ? { nextStatus: input.nextStatus } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.comment ? { comment: input.comment.slice(0, 500) } : {}),
      occurredAt: new Date().toISOString()
    };
    return this.toDto(await this.repository.appendHistory(event));
  }

  async forLead(leadAssignmentId: string): Promise<BrokerStarterLeadHistoryEvent[]> {
    return (await this.repository.historyForLead(leadAssignmentId)).map((event) => this.toDto(event));
  }

  async forTenant(partnerTenantId: string): Promise<BrokerStarterLeadHistoryEvent[]> {
    return (await this.repository.historyForTenant(partnerTenantId)).map((event) => this.toDto(event));
  }

  private toDto(event: LeadAssignmentHistoryRecord): BrokerStarterLeadHistoryEvent {
    return {
      id: event.id,
      eventType: event.eventType,
      ...(event.previousStatus ? { previousStatus: event.previousStatus } : {}),
      ...(event.nextStatus ? { nextStatus: event.nextStatus } : {}),
      ...(event.reason ? { reason: event.reason } : {}),
      ...(event.comment ? { comment: event.comment } : {}),
      occurredAt: event.occurredAt
    };
  }
}
