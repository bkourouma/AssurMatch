import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";

export interface RoutingDecisionRecord {
  id: string;
  quoteRequestId: string;
  result: "assigned" | "blocked" | "no_broker_available";
  selectedPartnerTenantId?: string;
  candidateCount: number;
  excludedCandidates: Array<{ partnerTenantId: string; reasons: string[] }>;
  reasons: string[];
  correlationId?: string;
  createdAt: Date;
}

export class RoutingDecisionService {
  private readonly decisions: RoutingDecisionRecord[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  record(input: Omit<RoutingDecisionRecord, "id" | "createdAt">, actor: ActorContext): RoutingDecisionRecord {
    const decision: RoutingDecisionRecord = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date()
    };
    this.decisions.push(decision);
    const action = decision.result === "assigned" ? QuoteAuditActions.routingAssigned : QuoteAuditActions.routingNoBrokerAvailable;
    this.audit.write({
      actor,
      action,
      targetType: "RoutingDecision",
      targetId: decision.id,
      scope: { quoteRequestId: decision.quoteRequestId, partnerTenantId: decision.selectedPartnerTenantId },
      result: "success",
      reason: decision.reasons.join(","),
      context: { candidateCount: decision.candidateCount, excludedCandidates: decision.excludedCandidates }
    });
    return decision;
  }

  list(): RoutingDecisionRecord[] {
    return [...this.decisions];
  }
}
