import type { BrokerStarterLeadHistoryEvent, BrokerStarterLeadStatus, BrokerStarterReason } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";

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

interface StoredHistoryEvent extends BrokerStarterLeadHistoryEvent {
  leadAssignmentId: string;
  partnerTenantId: string;
  actorId?: string;
}

export class BrokerStarterHistoryService {
  private readonly events: StoredHistoryEvent[] = [];

  append(input: BrokerStarterHistoryInput): BrokerStarterLeadHistoryEvent {
    const event: StoredHistoryEvent = {
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
    this.events.push(event);
    return this.toDto(event);
  }

  forLead(leadAssignmentId: string): BrokerStarterLeadHistoryEvent[] {
    return this.events
      .filter((event) => event.leadAssignmentId === leadAssignmentId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map((event) => this.toDto(event));
  }

  forTenant(partnerTenantId: string): BrokerStarterLeadHistoryEvent[] {
    return this.events.filter((event) => event.partnerTenantId === partnerTenantId).map((event) => this.toDto(event));
  }

  private toDto(event: StoredHistoryEvent): BrokerStarterLeadHistoryEvent {
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
