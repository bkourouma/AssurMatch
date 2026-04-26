import type { BrokerCrmHistoryEvent, BrokerCrmOutcomeReason, BrokerCrmPipelineStatus } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import { MemoryCrmActivityRepository, type BrokerCrmPipelineHistoryRecord, type CrmActivityRepository } from "./crm-activity.repository";

export interface BrokerCrmHistoryInput {
  leadAssignmentId: string;
  partnerTenantId: string;
  actor?: ActorContext;
  eventType: BrokerCrmHistoryEvent["eventType"];
  previousStatus?: BrokerCrmPipelineStatus;
  nextStatus?: BrokerCrmPipelineStatus;
  reason?: BrokerCrmOutcomeReason;
}

export class BrokerCrmHistoryService {
  constructor(private readonly repository: CrmActivityRepository = new MemoryCrmActivityRepository()) {}

  async append(input: BrokerCrmHistoryInput): Promise<BrokerCrmHistoryEvent> {
    const event: BrokerCrmPipelineHistoryRecord = {
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
    return this.toDto(await this.repository.appendPipelineHistory(event));
  }

  async forLead(leadAssignmentId: string): Promise<BrokerCrmHistoryEvent[]> {
    return (await this.repository.pipelineHistoryForLead(leadAssignmentId)).map((event) => this.toDto(event));
  }

  private toDto(event: BrokerCrmPipelineHistoryRecord): BrokerCrmHistoryEvent {
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
