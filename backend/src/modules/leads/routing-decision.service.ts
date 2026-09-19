import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryRoutingDecisionsRepository, type RoutingDecisionsRepository } from "./routing-decisions.repository";

export interface RoutingDecisionRecord {
  id: string;
  quoteRequestId: string;
  result: "assigned" | "blocked" | "no_broker_available" | "pending_manual_assignment";
  selectedPartnerTenantId?: string;
  /** Spec 042: every partner selected for this request; single-send holds one id. */
  selectedPartnerTenantIds?: string[];
  candidateCount: number;
  excludedCandidates: Array<{ partnerTenantId: string; reasons: string[] }>;
  reasons: string[];
  correlationId?: string;
  createdAt: Date;
}

export class RoutingDecisionService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: RoutingDecisionsRepository = new MemoryRoutingDecisionsRepository()) {}

  async record(input: Omit<RoutingDecisionRecord, "id" | "createdAt">, actor: ActorContext): Promise<RoutingDecisionRecord> {
    const decision: RoutingDecisionRecord = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date()
    };
    await this.repository.create(decision);
    const action = decision.result === "assigned"
      ? QuoteAuditActions.routingAssigned
      : decision.result === "pending_manual_assignment"
        ? QuoteAuditActions.routingEvaluated
        : QuoteAuditActions.routingNoBrokerAvailable;
    this.audit.write({
      actor,
      action,
      targetType: "RoutingDecision",
      targetId: decision.id,
      scope: { quoteRequestId: decision.quoteRequestId, partnerTenantId: decision.selectedPartnerTenantId },
      result: "success",
      reason: decision.reasons.join(","),
      context: {
        candidateCount: decision.candidateCount,
        excludedCandidates: decision.excludedCandidates,
        recipientCount: decision.selectedPartnerTenantIds?.length ?? (decision.selectedPartnerTenantId ? 1 : 0),
        ...(decision.selectedPartnerTenantIds ? { selectedPartnerTenantIds: decision.selectedPartnerTenantIds } : {})
      }
    });
    return decision;
  }

  list(): Promise<RoutingDecisionRecord[]> {
    return this.repository.list();
  }
}

export { ROUTING_DECISIONS_REPOSITORY, MemoryRoutingDecisionsRepository, type RoutingDecisionsRepository } from "./routing-decisions.repository";
