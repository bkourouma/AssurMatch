import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryRoutingDecisionsRepository, type RoutingDecisionsRepository } from "./routing-decisions.repository";

/**
 * Lot 5 (spec 071, PRD 17 controls 10 and 12, mode `ai_assisted`): explainability of the controls
 * that do not exclude a candidate. Persisted as `RoutingDecision.controlDetails` (JSON).
 */
export interface RoutingControlDetails {
  /** Control 12: deterministic lead quality score (0-100) and its breakdown. */
  qualityScore?: number;
  qualityFactors?: Array<{ key: string; points: number }>;
  qualityThreshold?: number;
  /** Control 10: eligible brokers ranked after the healthy ones because they are over SLA. */
  degradedCandidates?: Array<{ partnerTenantId: string; overrunCount: number; oldestOverrunMinutes?: number }>;
  /** Mode `ai_assisted`: advisory suggestion attached to a parked request (never applied by itself). */
  aiSuggestion?: { partnerTenantId: string; rationale: string; provider: string; generatedAt: string };
  /** Why the request waits for an admin (manual_rule, lead_quality_below_threshold, ai_suggestion_pending...). */
  parkedReasons?: string[];
}

export interface RoutingDecisionRecord {
  id: string;
  quoteRequestId: string;
  result: "assigned" | "blocked" | "no_broker_available" | "pending_manual_assignment";
  selectedPartnerTenantId?: string;
  /** Spec 042: every partner selected for this request; single-send holds one id. */
  selectedPartnerTenantIds?: string[];
  candidateCount: number;
  /** Spec 052 R7: offer chosen by the visitor and whether its broker was retained. */
  selectedOfferId?: string;
  selectedOfferOutcome?: "retained" | "unavailable" | "none";
  excludedCandidates: Array<{ partnerTenantId: string; reasons: string[] }>;
  reasons: string[];
  correlationId?: string;
  /** Lot 5 (spec 071): controls 10 and 12, AI suggestion and parked reasons. */
  controlDetails?: RoutingControlDetails;
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
        ...(decision.selectedOfferId ? { selectedOfferId: decision.selectedOfferId, selectedOfferOutcome: decision.selectedOfferOutcome ?? null } : {}),
        ...(decision.selectedPartnerTenantIds ? { selectedPartnerTenantIds: decision.selectedPartnerTenantIds } : {}),
        ...(decision.controlDetails ? { controlDetails: decision.controlDetails } : {})
      }
    });
    return decision;
  }

  list(): Promise<RoutingDecisionRecord[]> {
    return this.repository.list();
  }

  /** Lot 5 (spec 071): the latest decision of a request (manual queue: parked reasons, AI suggestion). */
  latestForQuote(quoteRequestId: string): Promise<RoutingDecisionRecord | undefined> {
    return this.repository.latestForQuote(quoteRequestId);
  }
}

export { ROUTING_DECISIONS_REPOSITORY, MemoryRoutingDecisionsRepository, type RoutingDecisionsRepository } from "./routing-decisions.repository";
