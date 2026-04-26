import type { BrokerCrmHistoryEvent, BrokerCrmOutcomeReason, BrokerCrmPipelineStatus } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";

export interface BrokerCrmHistoryInput {
  leadAssignmentId: string;
  partnerTenantId: string;
  actor?: ActorContext;
  eventType: BrokerCrmHistoryEvent["eventType"];
  previousStatus?: BrokerCrmPipelineStatus;
  nextStatus?: BrokerCrmPipelineStatus;
  reason?: BrokerCrmOutcomeReason;
}

interface StoredCrmHistoryEvent extends BrokerCrmHistoryEvent {
  leadAssignmentId: string;
  partnerTenantId: string;
  actorId?: string;
}

export class BrokerCrmHistoryService {
  private readonly events: StoredCrmHistoryEvent[] = [];

  append(input: BrokerCrmHistoryInput): BrokerCrmHistoryEvent {
    const event: StoredCrmHistoryEvent = {
      id: crypto.randomUUID(),
      leadAssignmentId: input.leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      ...(input.actor?.actorId ? { actorId: input.actor.actorId } : {}),
      eventType: input.eventType,
      ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
      ...(input.nextStatus ? { nextStatus: input.nextStatus } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      occurredAt: new Date().toISOString()
    };
    this.events.push(event);
    return this.toDto(event);
  }

  forLead(leadAssignmentId: string): BrokerCrmHistoryEvent[] {
    return this.events
      .filter((event) => event.leadAssignmentId === leadAssignmentId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map((event) => this.toDto(event));
  }

  private toDto(event: StoredCrmHistoryEvent): BrokerCrmHistoryEvent {
    return {
      id: event.id,
      eventType: event.eventType,
      ...(event.previousStatus ? { previousStatus: event.previousStatus } : {}),
      ...(event.nextStatus ? { nextStatus: event.nextStatus } : {}),
      ...(event.reason ? { reason: event.reason } : {}),
      occurredAt: event.occurredAt
    };
  }
}
